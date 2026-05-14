'use strict';
const promptProblemRepository = require('../repositories/promptProblemRepository');
const promptSubmissionRepository = require('../repositories/promptSubmissionRepository');
const candidateRepository = require('../repositories/candidateRepository');
const promptEvaluationService = require('./promptEvaluationService');
const promptProblemAiService = require('./promptProblemAiService');
const emailService = require('./emailService');
const { generateTestToken } = require('../utils/tokenGenerator');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const { PROMPT_SUBMISSION_STATUS, PROMPT_PROBLEM_SOURCE } = require('../utils/constants');

const PREVIEW_LIMIT = 5;

const assign = async ({ candidateId, problemId, adminId }) => {
  const candidate = await candidateRepository.findById(candidateId);
  if (!candidate) throw ApiError.notFound('Candidate not found');
  const problem = await promptProblemRepository.findById(problemId);
  if (!problem) throw ApiError.notFound('Prompt problem not found');

  const { token, expiresAt } = generateTestToken({ minutes: problem.durationMinutes });
  const submission = await promptSubmissionRepository.create({
    candidate: candidateId,
    promptProblem: problemId,
    accessToken: token,
    assignedAt: new Date(),
    expiresAt,
    status: PROMPT_SUBMISSION_STATUS.ASSIGNED,
  });

  candidate.promptTest = {
    token, expiresAt,
    problemId,
    durationMinutes: problem.durationMinutes,
    sentAt: new Date(),
    firstOpenedAt: null,
    submittedAt: null,
    reviewedAt: null,
    outcome: null,
  };
  await candidate.save();

  setImmediate(async () => {
    try {
      await emailService.sendPromptTestAssignedCandidate({ candidate, problem, accessToken: token, expiresAt });
    } catch (err) { logger.error('Prompt-test assigned email failed', { err: err.message }); }
  });

  return { submissionId: submission.id || submission._id, accessToken: token, expiresAt };
};

const generateAndAssign = async ({ candidateId, topicOverride, difficultyOverride, adminId }) => {
  const candidate = await candidateRepository.findById(candidateId);
  if (!candidate) throw ApiError.notFound('Candidate not found');
  const generated = await promptProblemAiService.generatePersonalizedPromptProblem({
    candidate, topicOverride, difficultyOverride,
  });
  if (!generated) {
    throw ApiError.badRequest('AI generation failed. Try again or author manually.', { code: 'E_AI_GEN_FAILED' });
  }
  // The admin will review/edit BEFORE save - this method returns the draft without persisting.
  // Persisting + assigning is done by saveGeneratedAndAssign below after admin clicks Save.
  return { draft: generated };
};

const saveGeneratedAndAssign = async ({ candidateId, draft, adminId }) => {
  const candidate = await candidateRepository.findById(candidateId);
  if (!candidate) throw ApiError.notFound('Candidate not found');

  const problem = await promptProblemRepository.create({
    title: draft.title, description: draft.description, sampleInput: draft.sampleInput,
    expectedOutputCriteria: draft.expectedOutputCriteria,
    customRubricCriteria: draft.customRubricCriteria || [],
    difficulty: draft.difficulty || 'medium',
    tags: draft.tags || [],
    durationMinutes: draft.durationMinutes || 20,
    source: PROMPT_PROBLEM_SOURCE.AI_PERSONALIZED,
    createdFor: candidateId,
    createdBy: adminId,
  });

  return assign({ candidateId, problemId: problem.id || problem._id, adminId });
};

const getByToken = async (token) => {
  const submission = await promptSubmissionRepository.findByToken(token);
  if (!submission) throw ApiError.notFound('Invalid or expired link');
  if (submission.expiresAt && submission.expiresAt < new Date()) {
    throw ApiError.badRequest('Test link expired', { code: 'E_EXPIRED' });
  }
  if (!submission.firstOpenedAt) {
    await promptSubmissionRepository.updateById(submission.id || submission._id, {
      firstOpenedAt: new Date(),
      status: PROMPT_SUBMISSION_STATUS.IN_PROGRESS,
    });
  }
  const p = submission.promptProblem;
  // Fetch the candidate's display name for the test header; failure must not
  // break the candidate's view, so swallow errors silently.
  let candidateName = '';
  try {
    const candidate = await candidateRepository.findById(submission.candidate);
    candidateName = candidate?.name || '';
  } catch (_err) { /* non-fatal */ }
  return {
    submissionId: submission.id || submission._id,
    title: p.title, description: p.description, sampleInput: p.sampleInput,
    difficulty: p.difficulty,
    tags: p.tags || [],
    durationMinutes: p.durationMinutes,
    expiresAt: submission.expiresAt,
    previewRunsUsed: submission.previewRunsUsed,
    previewRunsRemaining: Math.max(0, PREVIEW_LIMIT - submission.previewRunsUsed),
    lastPreviewOutput: submission.lastPreviewOutput,
    submitted: !!submission.submittedAt,
    candidatePrompt: submission.candidatePrompt || '',
    candidateName,
  };
};

const preview = async ({ token, candidatePrompt }) => {
  const submission = await promptSubmissionRepository.findByToken(token);
  if (!submission) throw ApiError.notFound('Invalid link');
  if (submission.submittedAt) throw ApiError.conflict('Test already submitted', { code: 'E_ALREADY_SUBMITTED' });
  if (submission.previewRunsUsed >= PREVIEW_LIMIT) {
    throw ApiError.conflict('Preview limit reached', { code: 'E_PREVIEW_LIMIT' });
  }
  const { output, provider } = await promptEvaluationService.runPreview({
    problem: submission.promptProblem, candidatePrompt,
  });
  if (output == null) throw ApiError.badRequest('AI service unavailable. Try again.');
  const updated = await promptSubmissionRepository.incrementPreviewRuns(submission.id || submission._id, output);
  return {
    output,
    runsRemaining: Math.max(0, PREVIEW_LIMIT - (updated?.previewRunsUsed || submission.previewRunsUsed + 1)),
  };
};

const submit = async ({ token, candidatePrompt }) => {
  const submission = await promptSubmissionRepository.findByToken(token);
  if (!submission) throw ApiError.notFound('Invalid link');
  if (submission.submittedAt) throw ApiError.conflict('Already submitted', { code: 'E_ALREADY_SUBMITTED' });
  const submittedAt = new Date();
  const updated = await promptSubmissionRepository.updateById(submission.id || submission._id, {
    candidatePrompt: String(candidatePrompt || '').slice(0, 8000),
    submittedAt,
    status: PROMPT_SUBMISSION_STATUS.SUBMITTED,
  });
  // Update candidate sub-doc
  try {
    const candidate = await candidateRepository.findById(submission.candidate);
    if (candidate && candidate.promptTest) {
      candidate.promptTest.submittedAt = submittedAt;
      await candidate.save();
    }
  } catch (err) { logger.warn('candidate.promptTest update on submit failed', { err: err.message }); }

  // Queue evaluation + HR email
  setImmediate(async () => {
    try { await promptEvaluationService.evaluate(submission.id || submission._id); }
    catch (err) { logger.error('Prompt evaluation crashed', { err: err.message }); }
  });
  setImmediate(async () => {
    try { await emailService.sendPromptTestSubmittedHr({ submissionId: submission.id || submission._id }); }
    catch (err) { logger.error('Prompt-test HR notify failed', { err: err.message }); }
  });
  return { submittedAt };
};

const reevaluate = async (submissionId) => {
  setImmediate(async () => {
    try { await promptEvaluationService.evaluate(submissionId); }
    catch (err) { logger.error('Re-evaluation crashed', { err: err.message }); }
  });
  return { queued: true };
};

const getSubmissionForCandidate = async (candidateId) =>
  promptSubmissionRepository.findByCandidate(candidateId);

module.exports = {
  assign, generateAndAssign, saveGeneratedAndAssign,
  getByToken, preview, submit, reevaluate,
  getSubmissionForCandidate,
  PREVIEW_LIMIT,
};
