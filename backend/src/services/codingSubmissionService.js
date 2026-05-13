'use strict';

const candidateRepo = require('../repositories/candidateRepository');
const subRepo = require('../repositories/codingSubmissionRepository');
const cpRepo = require('../repositories/codingProblemRepository');
const exec = require('./codingExecutionService');
const emailService = require('./emailService');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const { verifyTestToken } = require('../utils/tokenGenerator');

const presentRun = (r) => ({
  stdin: r.stdin,
  expectedStdout: r.expectedStdout,
  actualStdout: r.actualStdout,
  stderr: r.stderr,
  exitCode: r.exitCode,
  runtimeMs: r.runtimeMs,
  passed: !!r.passed,
  error: r.error || null,
});

const presentSubmission = (s) => ({
  id: s.id || String(s._id),
  candidate: s.candidate,
  problem: s.problem,
  language: s.language,
  code: s.code,
  runs: (s.runs || []).map(presentRun),
  passedCount: s.passedCount || 0,
  totalCount: s.totalCount || 0,
  rating: s.rating,
  reviewComment: s.reviewComment || '',
  reviewedBy: s.reviewedBy || null,
  reviewedAt: s.reviewedAt || null,
  tabSwitches: s.tabSwitches || 0,
  submittedAt: s.submittedAt,
  autoSubmitted: !!s.autoSubmitted,
  createdAt: s.createdAt,
  updatedAt: s.updatedAt,
});

const findCandidateByToken = async (token) => {
  if (!verifyTestToken(token)) return null;
  return candidateRepo.findByCodingTestToken(token);
};

const submitByToken = async ({ token, submissions, tabSwitches = 0, autoSubmitted = false }) => {
  const candidate = await findCandidateByToken(token);
  if (!candidate) throw ApiError.notFound('Invalid coding test link');
  if (candidate.codingTest.submittedAt) {
    throw ApiError.conflict('Already submitted', { code: 'E_ALREADY_SUBMITTED' });
  }
  if (candidate.codingTest.expiresAt && candidate.codingTest.expiresAt.getTime() < Date.now()) {
    throw ApiError.gone('Coding test link has expired', { code: 'E_CODING_TEST_EXPIRED' });
  }

  const persisted = [];
  for (const sub of submissions) {
    const problem = await cpRepo.findById(sub.problemId);
    if (!problem) {
      logger.warn('Skipping unknown problem in submission', { problemId: sub.problemId });
      continue;
    }
    const runs = await exec.runAllTestCases({
      language: sub.language,
      code: sub.code,
      testCases: problem.testCases || [],
    });
    const passedCount = runs.filter((r) => r.passed).length;
    const totalCount = runs.length;
    const doc = await subRepo.create({
      candidate: candidate._id,
      codingTestToken: token,
      problem: problem._id,
      language: sub.language,
      code: sub.code,
      runs,
      passedCount,
      totalCount,
      tabSwitches,
      submittedAt: new Date(),
      autoSubmitted,
    });
    persisted.push(doc);
  }

  candidate.codingTest.submittedAt = new Date();
  candidate.codingTest.outcome = 'pending_review';
  await candidate.save();

  setImmediate(async () => {
    try {
      await emailService.sendCodingSubmissionReceived({
        candidate: { id: candidate.id, name: candidate.name, email: candidate.email },
        submissions: persisted.map((p) => ({
          language: p.language,
          passedCount: p.passedCount,
          totalCount: p.totalCount,
        })),
      });
    } catch (err) {
      logger.error('Coding submission notification failed', { candidateId: candidate.id, err: err.message });
    }
  });

  return { submitted: persisted.length };
};

const markFirstOpened = async (token) => {
  const candidate = await findCandidateByToken(token);
  if (!candidate) return null;
  if (!candidate.codingTest.firstOpenedAt) {
    candidate.codingTest.firstOpenedAt = new Date();
    await candidate.save();
  }
  return candidate;
};

const loadTestByToken = async (token) => {
  const candidate = await findCandidateByToken(token);
  if (!candidate) throw ApiError.notFound('Invalid coding test link');
  if (candidate.codingTest.expiresAt && candidate.codingTest.expiresAt.getTime() < Date.now()) {
    throw ApiError.gone('Coding test link has expired', { code: 'E_CODING_TEST_EXPIRED' });
  }
  const problems = await Promise.all(
    (candidate.codingTest.problems || []).map((id) => cpRepo.findById(id)),
  );
  return {
    candidate: { name: candidate.name },
    problems: problems.filter(Boolean).map((p) => ({
      id: String(p._id),
      title: p.title,
      description: p.description,
      difficulty: p.difficulty,
      supportedLanguages: p.supportedLanguages,
      starterCode: p.starterCode,
      sampleCases: (p.testCases || []).filter((tc) => !tc.isHidden),
    })),
    durationMinutes: candidate.codingTest.durationMinutes,
    firstOpenedAt: candidate.codingTest.firstOpenedAt,
    submittedAt: candidate.codingTest.submittedAt,
  };
};

const rate = async (submissionId, { rating, reviewComment }, adminId) => {
  const sub = await subRepo.findById(submissionId);
  if (!sub) throw ApiError.notFound('Submission not found');
  if (rating !== null && rating !== undefined && (rating < 1 || rating > 5)) {
    throw ApiError.badRequest('Rating must be 1-5');
  }
  const updated = await subRepo.updateById(submissionId, {
    rating: rating ?? null,
    reviewComment: reviewComment || '',
    reviewedBy: adminId,
    reviewedAt: new Date(),
  });
  return presentSubmission(updated);
};

const rerun = async (submissionId) => {
  const sub = await subRepo.findById(submissionId);
  if (!sub) throw ApiError.notFound('Submission not found');
  const problem = await cpRepo.findById(sub.problem);
  if (!problem) throw ApiError.notFound('Problem missing');
  const runs = await exec.runAllTestCases({
    language: sub.language,
    code: sub.code,
    testCases: problem.testCases || [],
  });
  const passedCount = runs.filter((r) => r.passed).length;
  const totalCount = runs.length;
  const updated = await subRepo.updateById(submissionId, { runs, passedCount, totalCount });
  return presentSubmission(updated);
};

const listForCandidate = async (candidateId) => {
  const subs = await subRepo.findByCandidate(candidateId);
  return subs.map(presentSubmission);
};

// Run candidate's code against VISIBLE test cases only. Hidden cases stay hidden
// until final submission. Does not persist anything; pure execution.
const runVisibleByToken = async ({ token, problemId, language, code }) => {
  const candidate = await findCandidateByToken(token);
  if (!candidate) throw ApiError.notFound('Invalid coding test link');
  if (candidate.codingTest.submittedAt) {
    throw ApiError.conflict('Already submitted', { code: 'E_ALREADY_SUBMITTED' });
  }
  if (candidate.codingTest.expiresAt && candidate.codingTest.expiresAt.getTime() < Date.now()) {
    throw ApiError.gone('Coding test link has expired', { code: 'E_CODING_TEST_EXPIRED' });
  }

  const assigned = (candidate.codingTest.problems || []).map(String);
  if (!assigned.includes(String(problemId))) {
    throw ApiError.forbidden('Problem is not part of this candidate\'s test', { code: 'E_PROBLEM_NOT_ASSIGNED' });
  }

  const problem = await cpRepo.findById(problemId);
  if (!problem) throw ApiError.notFound('Problem not found');
  if (!problem.supportedLanguages.includes(language)) {
    throw ApiError.badRequest(`Language '${language}' is not supported for this problem`, { code: 'E_LANGUAGE_UNSUPPORTED' });
  }

  const visible = (problem.testCases || []).filter((tc) => !tc.isHidden);
  if (visible.length === 0) {
    return { runs: [], message: 'No visible test cases to run against.' };
  }

  const runs = await exec.runAllTestCases({ language, code, testCases: visible });
  return {
    runs: runs.map(presentRun),
    passedCount: runs.filter((r) => r.passed).length,
    totalCount: runs.length,
  };
};

module.exports = {
  submitByToken, markFirstOpened, loadTestByToken, runVisibleByToken,
  rate, rerun, listForCandidate, presentSubmission,
};
