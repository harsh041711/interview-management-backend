'use strict';

const path = require('path');
const candidateRepository = require('../repositories/candidateRepository');
const submissionRepository = require('../repositories/submissionRepository');
const interviewRepository = require('../repositories/interviewRepository');
const rescheduleRequestRepository = require('../repositories/rescheduleRequestRepository');
const reviewRepository = require('../repositories/reviewRepository');
const liveSessionRepository = require('../repositories/liveSessionRepository');
const codingProblemService = require('./codingProblemService');
const { generateTestToken } = require('../utils/tokenGenerator');
const { destroyAsset, uploadBufferToCloudinary } = require('./uploadService');
const emailService = require('./emailService');
const jdService = require('./jobDescriptionService');
const resumeScreeningService = require('./resumeScreeningService');
const ApiError = require('../utils/ApiError');
const env = require('../config/env');
const logger = require('../config/logger');
const { CANDIDATE_STATUS, ROUND1_OUTCOMES } = require('../utils/constants');

const buildTestUrl = (token) => {
  const base = env.frontendUrl.replace(/\/$/, '');
  return `${base}/test/${token}`;
};

const buildCodingTestUrl = (token) => {
  const base = env.frontendUrl.replace(/\/$/, '');
  return `${base}/coding-test/${token}`;
};

const CODING_TEST_EXPIRY_HOURS = 24;

const presentCandidate = (candidate) => ({
  id: candidate.id,
  name: candidate.name,
  email: candidate.email,
  techStack: candidate.techStack,
  experience: candidate.experience,
  status: candidate.status,
  questionCount: candidate.questionCount,
  durationMinutes: candidate.durationMinutes,
  photoUrl: candidate.photoUrl,
  resumeUrl: candidate.resumeUrl,
  resumeOriginalName: candidate.resumeOriginalName,
  resumeMimeType: candidate.resumeMimeType,
  resumeBytes: candidate.resumeBytes,
  resumeUploadedAt: candidate.resumeUploadedAt,
  screening: candidate.screening?.status
    ? {
        status: candidate.screening.status,
        matchPercent: candidate.screening.matchPercent,
        greenFlags: candidate.screening.greenFlags || [],
        redFlags: candidate.screening.redFlags || [],
        summary: candidate.screening.summary || '',
        jdId: candidate.screening.jdId || null,
        jdSnapshot: candidate.screening.jdSnapshot || null,
        scoredAt: candidate.screening.scoredAt || null,
        scoredBy: candidate.screening.scoredBy || null,
      }
    : null,
  codingTest: candidate.codingTest?.sentAt
    ? {
        sentAt: candidate.codingTest.sentAt,
        firstOpenedAt: candidate.codingTest.firstOpenedAt || null,
        submittedAt: candidate.codingTest.submittedAt || null,
        reviewedAt: candidate.codingTest.reviewedAt || null,
        outcome: candidate.codingTest.outcome || null,
        problemCount: candidate.codingTest.problemCount,
        durationMinutes: candidate.codingTest.durationMinutes,
        difficulty: candidate.codingTest.difficulty,
        expiresAt: candidate.codingTest.expiresAt,
        problems: candidate.codingTest.problems || [],
        codingTestUrl: candidate.codingTest.token ? buildCodingTestUrl(candidate.codingTest.token) : null,
      }
    : null,
  promptTest: candidate.promptTest?.sentAt
    ? {
        sentAt: candidate.promptTest.sentAt,
        firstOpenedAt: candidate.promptTest.firstOpenedAt || null,
        submittedAt: candidate.promptTest.submittedAt || null,
        reviewedAt: candidate.promptTest.reviewedAt || null,
        outcome: candidate.promptTest.outcome || null,
        durationMinutes: candidate.promptTest.durationMinutes,
        expiresAt: candidate.promptTest.expiresAt,
        problemId: candidate.promptTest.problemId || null,
      }
    : null,
  testToken: candidate.testToken,
  testUrl: buildTestUrl(candidate.testToken),
  tokenExpiresAt: candidate.tokenExpiresAt,
  createdAt: candidate.createdAt,
  updatedAt: candidate.updatedAt,
});

const DEFAULT_MIN_PER_QUESTION = 1.2;

const computeDuration = (questionCount) =>
  Math.max(5, Math.round(questionCount * DEFAULT_MIN_PER_QUESTION));

const queueInviteEmail = (candidate) => {
  const presented = presentCandidate(candidate);
  setImmediate(async () => {
    try {
      await emailService.sendCandidateInvite({
        candidate: presented,
        testUrl: presented.testUrl,
      });
    } catch (err) {
      logger.error('Candidate invite email failed', {
        candidateId: presented.id,
        email: presented.email,
        err: err.message,
      });
    }
  });
};

const createCandidate = async ({ name, email, techStack, experience, questionCount, durationMinutes }, adminId) => {
  const { token, expiresAt } = generateTestToken();
  const finalCount = Number.isFinite(questionCount) ? questionCount : 10;
  const finalDuration = Number.isFinite(durationMinutes)
    ? durationMinutes
    : computeDuration(finalCount);
  const candidate = await candidateRepository.create({
    name,
    email,
    techStack,
    experience,
    questionCount: finalCount,
    durationMinutes: finalDuration,
    testToken: token,
    tokenExpiresAt: expiresAt,
    createdBy: adminId,
    // status defaults to RESUME_PENDING via the model.
  });
  return presentCandidate(candidate);
};

const regenerateToken = async (id) => {
  const candidate = await candidateRepository.findById(id);
  if (!candidate) throw ApiError.notFound('Candidate not found');
  if ([CANDIDATE_STATUS.IN_PROGRESS, CANDIDATE_STATUS.COMPLETED, CANDIDATE_STATUS.CHEATED, CANDIDATE_STATUS.SHORTLISTED, CANDIDATE_STATUS.REJECTED].includes(candidate.status)) {
    throw ApiError.conflict(`Cannot regenerate token for ${candidate.status} candidate`);
  }
  const { token, expiresAt } = generateTestToken();
  candidate.testToken = token;
  candidate.tokenExpiresAt = expiresAt;
  candidate.status = CANDIDATE_STATUS.PENDING;
  await candidate.save();
  queueInviteEmail(candidate);
  return presentCandidate(candidate);
};

const resendInvite = async (id) => {
  const candidate = await candidateRepository.findById(id);
  if (!candidate) throw ApiError.notFound('Candidate not found');
  if ([CANDIDATE_STATUS.COMPLETED, CANDIDATE_STATUS.CHEATED, CANDIDATE_STATUS.SHORTLISTED, CANDIDATE_STATUS.REJECTED].includes(candidate.status)) {
    throw ApiError.conflict(`Cannot resend invite — test already ${candidate.status}`);
  }
  if (candidate.tokenExpiresAt && candidate.tokenExpiresAt.getTime() < Date.now()) {
    throw ApiError.conflict('Test link has expired — regenerate it first');
  }
  const presented = presentCandidate(candidate);
  // Send synchronously here so the UI can surface SMTP errors directly.
  await emailService.sendCandidateInvite({ candidate: presented, testUrl: presented.testUrl });
  return { sentTo: presented.email, expiresAt: presented.tokenExpiresAt };
};

const list = async (query) => {
  const result = await candidateRepository.list(query);
  return {
    ...result,
    items: result.items.map(presentCandidate),
  };
};

const presentInterviewLite = (iv) => ({
  id: iv._id?.toString?.() || iv.id,
  _id: iv._id?.toString?.() || iv.id,
  round: iv.round,
  roundType: iv.roundType,
  status: iv.status,
  scheduledAt: iv.scheduledAt,
  completedAt: iv.completedAt,
  durationMinutes: iv.durationMinutes,
  notes: iv.notes,
  interviewer: iv.interviewer
    ? { id: iv.interviewer._id?.toString?.() || iv.interviewer.id, name: iv.interviewer.name }
    : null,
});

const presentCopilotQuestion = (q) => ({
  text: q.text,
  topic: q.topic,
  difficulty: q.difficulty,
  askedAt: q.askedAt,
  rating: q.rating,
  note: q.note,
});

const detail = async (id) => {
  const candidate = await candidateRepository.findById(id);
  if (!candidate) throw ApiError.notFound('Candidate not found');
  const submission = await submissionRepository.findByCandidate(id);

  const interviewsRaw = (await interviewRepository.list({ candidateId: id, limit: 100 })).items || [];
  const interviewsSorted = [...interviewsRaw].sort((a, b) => (a.round || 0) - (b.round || 0));

  // Fetch copilot session per interview in parallel; missing sessions yield [].
  const sessionsByInterview = await Promise.all(
    interviewsSorted.map((iv) => liveSessionRepository.findLatestByInterview(iv._id || iv.id)),
  );

  const interviews = interviewsSorted.map((iv, idx) => {
    const session = sessionsByInterview[idx];
    const askedQuestions = (session?.questions || []).filter((q) => q.askedAt);
    return {
      ...presentInterviewLite(iv),
      copilotQuestions: askedQuestions.map(presentCopilotQuestion),
    };
  });

  const reviews = await reviewRepository.findAllByCandidate(id);

  return {
    candidate: presentCandidate(candidate),
    submission,
    interviews,
    reviews,
  };
};

const remove = async (id) => {
  const candidate = await candidateRepository.findById(id);
  if (!candidate) throw ApiError.notFound('Candidate not found');

  // Cascade: delete all interviews (and their reschedule requests) for this candidate
  try {
    const interviews = await interviewRepository.list({ candidateId: id, limit: 1000 });
    for (const interview of interviews.items) {
      const interviewId = interview._id || interview.id;
      try {
        await rescheduleRequestRepository.deleteByInterview(interviewId);
      } catch (err) {
        logger.error('Failed to delete reschedule requests for interview', {
          interviewId,
          err: err.message,
        });
      }
      try {
        await interviewRepository.deleteById(interviewId);
      } catch (err) {
        logger.error('Failed to delete interview', { interviewId, err: err.message });
      }
    }
  } catch (err) {
    logger.error('Failed to cascade-delete interviews for candidate', {
      candidateId: id,
      err: err.message,
    });
  }

  if (candidate.photoPublicId) {
    await destroyAsset(candidate.photoPublicId);
  }
  if (candidate.resumePublicId) {
    await destroyAsset(candidate.resumePublicId);
  }
  await candidateRepository.deleteById(id);
  return { id };
};

const sanitizeBaseName = (filename) => {
  const base = path.parse(filename || 'resume').name;
  return base.replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 80) || 'resume';
};

const uploadResume = async (id, file) => {
  if (!file) throw ApiError.badRequest('Resume file is required', { code: 'E_FILE_MISSING' });
  const candidate = await candidateRepository.findById(id);
  if (!candidate) throw ApiError.notFound('Candidate not found');

  const folder = `${env.cloudinary.folder}/resumes`;
  const publicId = `${candidate.id}-${Date.now()}-${sanitizeBaseName(file.originalname)}`;
  const result = await uploadBufferToCloudinary(file.buffer, {
    folder,
    publicId,
    resourceType: 'raw',
    tags: ['resume', `candidate:${candidate.id}`],
  });

  const previousPublicId = candidate.resumePublicId;
  candidate.resumeUrl = result.url;
  candidate.resumePublicId = result.publicId;
  candidate.resumeOriginalName = file.originalname;
  candidate.resumeMimeType = file.mimetype;
  candidate.resumeBytes = file.size;
  candidate.resumeUploadedAt = new Date();
  await candidate.save();

  if (previousPublicId && previousPublicId !== result.publicId) {
    destroyAsset(previousPublicId).catch((err) =>
      logger.warn('Failed to destroy previous resume asset', { previousPublicId, err: err.message }),
    );
  }

  // Only auto-screen on FIRST upload (no prior screening result). Re-uploads use the manual Re-screen button.
  // Note: mongoose auto-inits the nested `screening` as {} on new docs, so check the inner `status` field.
  if (candidate.status === CANDIDATE_STATUS.RESUME_PENDING && !candidate.screening?.status) {
    try {
      await runScreeningFor(candidate, { buffer: file.buffer });
    } catch (err) {
      logger.error('Auto-screening failed', { candidateId: candidate.id, err: err.message });
      candidate.screening = { status: 'failed', scoredAt: new Date() };
      await candidate.save();
    }
  }

  return presentCandidate(candidate);
};

const removeResume = async (id) => {
  const candidate = await candidateRepository.findById(id);
  if (!candidate) throw ApiError.notFound('Candidate not found');
  if (!candidate.resumePublicId && !candidate.resumeUrl) {
    return presentCandidate(candidate);
  }

  const publicId = candidate.resumePublicId;
  candidate.resumeUrl = null;
  candidate.resumePublicId = null;
  candidate.resumeOriginalName = null;
  candidate.resumeMimeType = null;
  candidate.resumeBytes = null;
  candidate.resumeUploadedAt = null;
  await candidate.save();

  if (publicId) {
    destroyAsset(publicId).catch((err) =>
      logger.warn('Failed to destroy resume asset', { publicId, err: err.message }),
    );
  }
  return presentCandidate(candidate);
};

const stats = async () => candidateRepository.countByStatus();

const select = async (id) => {
  const c = await candidateRepository.findById(id);
  if (!c) throw ApiError.notFound('Candidate not found');
  if (c.status !== CANDIDATE_STATUS.AWAITING_DECISION) {
    throw ApiError.conflict('Candidate not awaiting decision', { code: 'E_BAD_STATUS' });
  }
  const review = await reviewRepository.findByCandidate(id);
  if (!review) throw ApiError.conflict('No review yet', { code: 'E_NO_REVIEW' });

  c.status = CANDIDATE_STATUS.SELECTED_FOR_CULTURE;
  await c.save();

  setImmediate(async () => {
    try {
      await emailService.sendCultureFitInvite({ candidate: c });
    } catch (err) {
      logger.error('Culture-fit email failed', { candidateId: id, err: err.message });
    }
  });

  return presentCandidate(c);
};

const reject = async (id, { note } = {}) => {
  const c = await candidateRepository.findById(id);
  if (!c) throw ApiError.notFound('Candidate not found');
  if (c.status !== CANDIDATE_STATUS.AWAITING_DECISION) {
    throw ApiError.conflict('Candidate not awaiting decision', { code: 'E_BAD_STATUS' });
  }
  const review = await reviewRepository.findByCandidate(id);
  if (!review) throw ApiError.conflict('No review yet', { code: 'E_NO_REVIEW' });

  c.status = CANDIDATE_STATUS.FINAL_REJECTED;
  await c.save();

  setImmediate(async () => {
    try {
      await emailService.sendFinalRejection({ candidate: c, note: note || null });
    } catch (err) {
      logger.error('Final rejection email failed', { candidateId: id, err: err.message });
    }
  });

  return presentCandidate(c);
};

const fetchResumeBuffer = async (resumeUrl) => {
  if (!resumeUrl) return null;
  try {
    const res = await fetch(resumeUrl);
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch (err) {
    logger.warn('Resume fetch failed', { resumeUrl, err: err.message });
    return null;
  }
};

const runScreeningFor = async (candidate, { buffer } = {}) => {
  // candidate.techStack is an array — try each in order until we find a matching active JD.
  let jd = null;
  for (const stack of (Array.isArray(candidate.techStack) ? candidate.techStack : [])) {
    jd = await jdService.lookup(stack, candidate.experience);
    if (jd) break;
  }
  if (!jd) {
    candidate.screening = { status: 'skipped', scoredAt: new Date() };
    await candidate.save();
    return;
  }
  const resumeBuffer = buffer || (await fetchResumeBuffer(candidate.resumeUrl));
  const resumeText = await resumeScreeningService.extractResumeText(resumeBuffer, candidate.resumeMimeType);
  const result = await resumeScreeningService.score({ resumeText, jd });
  candidate.screening = result;
  await candidate.save();
};

const rescreen = async (id) => {
  const candidate = await candidateRepository.findById(id);
  if (!candidate) throw ApiError.notFound('Candidate not found');
  if (![CANDIDATE_STATUS.RESUME_PENDING, CANDIDATE_STATUS.RESUME_APPROVED].includes(candidate.status)) {
    throw ApiError.conflict(
      `Cannot re-screen a candidate in '${candidate.status}' state`,
      { code: 'E_NOT_RESCREENABLE' },
    );
  }
  if (!candidate.resumeUrl) {
    throw ApiError.badRequest('Candidate has no resume to screen', { code: 'E_NO_RESUME' });
  }
  try {
    await runScreeningFor(candidate);
  } catch (err) {
    logger.error('Re-screening failed', { candidateId: candidate.id, err: err.message });
    candidate.screening = { status: 'failed', scoredAt: new Date() };
    await candidate.save();
  }
  return presentCandidate(candidate);
};

const approveResume = async (id) => {
  const candidate = await candidateRepository.findById(id);
  if (!candidate) throw ApiError.notFound('Candidate not found');
  if (candidate.status !== CANDIDATE_STATUS.RESUME_PENDING) {
    throw ApiError.conflict(
      `Candidate is in '${candidate.status}' state — cannot approve`,
      { code: 'E_ALREADY_DECIDED' },
    );
  }
  candidate.status = CANDIDATE_STATUS.RESUME_APPROVED;
  await candidate.save();

  const presented = presentCandidate(candidate);
  setImmediate(async () => {
    try {
      await emailService.sendResumeShortlisted({ candidate: presented });
    } catch (err) {
      logger.error('Resume shortlist email failed', { candidateId: presented.id, err: err.message });
    }
  });
  return presented;
};

const declineResume = async (id) => {
  const candidate = await candidateRepository.findById(id);
  if (!candidate) throw ApiError.notFound('Candidate not found');
  if (candidate.status !== CANDIDATE_STATUS.RESUME_PENDING) {
    throw ApiError.conflict(
      `Candidate is in '${candidate.status}' state — cannot decline`,
      { code: 'E_ALREADY_DECIDED' },
    );
  }
  candidate.status = CANDIDATE_STATUS.RESUME_DECLINED;
  await candidate.save();

  const presented = presentCandidate(candidate);
  setImmediate(async () => {
    try {
      await emailService.sendResumeDeclined({ candidate: presented });
    } catch (err) {
      logger.error('Resume decline email failed', { candidateId: presented.id, err: err.message });
    }
  });
  return presented;
};

const sendTest = async (id) => {
  const candidate = await candidateRepository.findById(id);
  if (!candidate) throw ApiError.notFound('Candidate not found');
  if (candidate.status !== CANDIDATE_STATUS.RESUME_APPROVED) {
    throw ApiError.conflict(
      `Candidate must be in 'resume_approved' state to send test (currently '${candidate.status}')`,
      { code: 'E_NOT_APPROVED' },
    );
  }
  // Generate a fresh token + expiration so the candidate has a full window starting now,
  // not from whenever the candidate was originally created.
  const { token, expiresAt } = generateTestToken();
  candidate.testToken = token;
  candidate.tokenExpiresAt = expiresAt;
  candidate.status = CANDIDATE_STATUS.PENDING;
  await candidate.save();

  // Re-use the existing invite email pipeline.
  queueInviteEmail(candidate);
  return presentCandidate(candidate);
};

const sendCodingTest = async (id, { problemCount = 1, durationMinutes = 30, difficulty = 'medium', problemIds }, adminId) => {
  const candidate = await candidateRepository.findById(id);
  if (!candidate) throw ApiError.notFound('Candidate not found');
  if (!['shortlisted', 'awaiting_decision', 'selected_for_culture'].includes(candidate.status)) {
    throw ApiError.conflict('Candidate must clear the MCQ test first', { code: 'E_MCQ_NOT_CLEARED' });
  }
  if (candidate.codingTest?.sentAt && !candidate.codingTest?.submittedAt) {
    const expired = candidate.codingTest.expiresAt && candidate.codingTest.expiresAt.getTime() < Date.now();
    if (!expired) {
      throw ApiError.conflict(
        'Coding test already sent — use regenerate to issue a new link',
        { code: 'E_CODING_TEST_ALREADY_SENT' },
      );
    }
  }

  let chosen;
  if (Array.isArray(problemIds) && problemIds.length > 0) {
    // Manual selection: HR picked specific problems.
    const docs = await Promise.all(problemIds.map((pid) => codingProblemService.detail(pid)));
    const inactive = docs.filter((p) => !p.isActive);
    if (inactive.length > 0) {
      throw ApiError.conflict(
        `Selected problem(s) are inactive: ${inactive.map((p) => p.title).join(', ')}`,
        { code: 'E_PROBLEM_INACTIVE' },
      );
    }
    chosen = docs;
  } else {
    // Auto-sample from the bank (with AI fallback when bank is short).
    chosen = await codingProblemService.sampleForCandidate({
      techStacks: candidate.techStack,
      difficulty,
      problemCount,
      adminId,
    });
  }

  const { token, expiresAt } = generateTestToken({ minutes: 60 * CODING_TEST_EXPIRY_HOURS });
  candidate.codingTest = {
    token,
    expiresAt,
    problems: chosen.map((p) => p.id),
    problemCount: chosen.length,
    durationMinutes,
    difficulty,
    sentAt: new Date(),
    firstOpenedAt: null,
    submittedAt: null,
    reviewedAt: null,
    outcome: null,
  };
  await candidate.save();

  const presented = presentCandidate(candidate);
  setImmediate(async () => {
    try {
      await emailService.sendCodingTestInvite({
        candidate: presented,
        codingTestUrl: presented.codingTest.codingTestUrl,
        problemCount: chosen.length,
        durationMinutes,
      });
    } catch (err) {
      logger.error('Coding test invite email failed', { candidateId: id, err: err.message });
    }
  });
  return presented;
};

const regenerateCodingTest = async (id, adminId) => {
  const candidate = await candidateRepository.findById(id);
  if (!candidate) throw ApiError.notFound('Candidate not found');
  if (!candidate.codingTest?.sentAt) {
    throw ApiError.conflict('No coding test to regenerate', { code: 'E_NO_CODING_TEST' });
  }
  const { token, expiresAt } = generateTestToken({ minutes: 60 * CODING_TEST_EXPIRY_HOURS });
  candidate.codingTest.token = token;
  candidate.codingTest.expiresAt = expiresAt;
  candidate.codingTest.firstOpenedAt = null;
  candidate.codingTest.submittedAt = null;
  candidate.codingTest.reviewedAt = null;
  candidate.codingTest.outcome = null;
  candidate.codingTest.sentAt = new Date();
  await candidate.save();

  const presented = presentCandidate(candidate);
  setImmediate(async () => {
    try {
      await emailService.sendCodingTestInvite({
        candidate: presented,
        codingTestUrl: presented.codingTest.codingTestUrl,
        problemCount: candidate.codingTest.problemCount,
        durationMinutes: candidate.codingTest.durationMinutes,
      });
    } catch (err) {
      logger.error('Coding test invite re-fire failed', { candidateId: id, err: err.message });
    }
  });
  return presented;
};

const resendCodingTest = async (id) => {
  const candidate = await candidateRepository.findById(id);
  if (!candidate) throw ApiError.notFound('Candidate not found');
  if (!candidate.codingTest?.sentAt) {
    throw ApiError.conflict('No coding test to resend', { code: 'E_NO_CODING_TEST' });
  }
  if (candidate.codingTest.expiresAt && candidate.codingTest.expiresAt.getTime() < Date.now()) {
    throw ApiError.conflict('Coding test link has expired — regenerate instead', { code: 'E_CODING_TEST_EXPIRED' });
  }
  const presented = presentCandidate(candidate);
  await emailService.sendCodingTestInvite({
    candidate: presented,
    codingTestUrl: presented.codingTest.codingTestUrl,
    problemCount: candidate.codingTest.problemCount,
    durationMinutes: candidate.codingTest.durationMinutes,
  });
  return { sentTo: presented.email };
};

const codingShortlist = async (id) => {
  const candidate = await candidateRepository.findById(id);
  if (!candidate) throw ApiError.notFound('Candidate not found');
  if (!candidate.codingTest?.submittedAt) {
    throw ApiError.conflict('Coding test not submitted', { code: 'E_NO_CODING_SUBMISSION' });
  }
  if (candidate.codingTest.outcome && candidate.codingTest.outcome !== 'pending_review') {
    throw ApiError.conflict('Coding test already decided', { code: 'E_ALREADY_DECIDED' });
  }
  candidate.status = CANDIDATE_STATUS.SHORTLISTED;
  candidate.codingTest.outcome = 'shortlisted';
  candidate.codingTest.reviewedAt = new Date();
  await candidate.save();

  const presented = presentCandidate(candidate);
  setImmediate(async () => {
    try {
      await emailService.sendRound1Result({
        candidate: presented,
        submission: null,
        outcome: ROUND1_OUTCOMES.SHORTLISTED,
      });
    } catch (err) {
      logger.error('Coding shortlist email failed', { candidateId: id, err: err.message });
    }
  });
  return presented;
};

const codingReject = async (id) => {
  const candidate = await candidateRepository.findById(id);
  if (!candidate) throw ApiError.notFound('Candidate not found');
  if (!candidate.codingTest?.submittedAt) {
    throw ApiError.conflict('Coding test not submitted', { code: 'E_NO_CODING_SUBMISSION' });
  }
  if (candidate.codingTest.outcome && candidate.codingTest.outcome !== 'pending_review') {
    throw ApiError.conflict('Coding test already decided', { code: 'E_ALREADY_DECIDED' });
  }
  candidate.status = CANDIDATE_STATUS.REJECTED;
  candidate.codingTest.outcome = 'rejected';
  candidate.codingTest.reviewedAt = new Date();
  await candidate.save();

  const presented = presentCandidate(candidate);
  setImmediate(async () => {
    try {
      await emailService.sendRound1Result({
        candidate: presented,
        submission: null,
        outcome: ROUND1_OUTCOMES.REJECTED,
      });
    } catch (err) {
      logger.error('Coding reject email failed', { candidateId: id, err: err.message });
    }
  });
  return presented;
};

module.exports = {
  createCandidate,
  regenerateToken,
  resendInvite,
  list,
  detail,
  remove,
  stats,
  uploadResume,
  removeResume,
  presentCandidate,
  buildTestUrl,
  select,
  reject,
  rescreen,
  approveResume,
  declineResume,
  sendTest,
  sendCodingTest,
  regenerateCodingTest,
  resendCodingTest,
  codingShortlist,
  codingReject,
};
