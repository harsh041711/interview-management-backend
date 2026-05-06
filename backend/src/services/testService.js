'use strict';

const candidateRepository = require('../repositories/candidateRepository');
const questionRepository = require('../repositories/questionRepository');
const sessionRepository = require('../repositories/sessionRepository');
const submissionRepository = require('../repositories/submissionRepository');
const evaluationService = require('./evaluationService');
const { uploadBufferToCloudinary, destroyAsset } = require('./uploadService');
const emailService = require('./emailService');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const env = require('../config/env');
const {
  CANDIDATE_STATUS,
  SESSION_STATUS,
  CHEAT_EVENT_TYPES,
} = require('../utils/constants');

// Strip answer-revealing fields before sending question to candidate.
const sanitizeQuestionForCandidate = (q) => ({
  id: String(q._id || q.id),
  techStack: q.techStack,
  type: q.type,
  question: q.question,
  options: q.options || undefined,
  marks: q.marks,
  difficulty: q.difficulty,
});

const presentCandidatePublic = (candidate) => ({
  id: candidate.id,
  name: candidate.name,
  email: candidate.email,
  techStack: candidate.techStack,
  status: candidate.status,
  durationMinutes: candidate.durationMinutes,
  photoUrl: candidate.photoUrl,
  tokenExpiresAt: candidate.tokenExpiresAt,
});

const validateToken = async (candidate) => ({ candidate: presentCandidatePublic(candidate) });

const uploadPhoto = async (candidate, file) => {
  if (!file?.buffer) throw ApiError.badRequest('photo file required');
  if (candidate.photoPublicId) {
    await destroyAsset(candidate.photoPublicId);
  }
  const result = await uploadBufferToCloudinary(file.buffer, {
    publicId: `candidate_${candidate.id}`,
    tags: ['candidate-photo'],
  });
  candidate.photoUrl = result.url;
  candidate.photoPublicId = result.publicId;
  candidate.photoCapturedAt = new Date();
  if (candidate.status === CANDIDATE_STATUS.PENDING) {
    candidate.status = CANDIDATE_STATUS.PHOTO_CAPTURED;
  }
  await candidate.save();
  return { photoUrl: candidate.photoUrl, photoCapturedAt: candidate.photoCapturedAt };
};

const startTest = async (candidate, { ipAddress, userAgent } = {}) => {
  if (candidate.status === CANDIDATE_STATUS.IN_PROGRESS) {
    const existing = await sessionRepository.findByCandidate(candidate.id);
    if (existing && existing.status === SESSION_STATUS.ACTIVE) {
      const populated = await sessionRepository.findByIdPopulated(existing.id);
      return {
        session: {
          id: existing.id,
          startedAt: existing.startedAt,
          endsAt: existing.endsAt,
          status: existing.status,
        },
        questions: populated.questions.map(sanitizeQuestionForCandidate),
        candidate: presentCandidatePublic(candidate),
      };
    }
  }

  if ([CANDIDATE_STATUS.COMPLETED, CANDIDATE_STATUS.CHEATED, CANDIDATE_STATUS.EXPIRED].includes(candidate.status)) {
    throw ApiError.forbidden(`Cannot start test in ${candidate.status} state`);
  }

  if (!candidate.photoUrl) {
    throw ApiError.badRequest('Photo capture is required before starting the test', { code: 'E_PHOTO_REQUIRED' });
  }

  const desiredCount = candidate.questionCount || 10;
  const sampled = await questionRepository.sampleForTest({
    techStack: candidate.techStack,
    count: desiredCount,
  });
  if (!sampled.length) {
    throw ApiError.unprocessable(
      'No questions available for the candidate tech stack. Add questions in the Questions panel first.',
      { code: 'E_NO_QUESTIONS' },
    );
  }

  const startedAt = new Date();
  const durationMs = (candidate.durationMinutes || env.test.defaultDurationMinutes) * 60_000;
  const endsAt = new Date(startedAt.getTime() + durationMs);
  const ids = sampled.map((q) => q._id);

  const session = await sessionRepository.create({
    candidate: candidate.id,
    questions: ids,
    startedAt,
    endsAt,
    ipAddress,
    userAgent,
  });

  candidate.status = CANDIDATE_STATUS.IN_PROGRESS;
  await candidate.save();

  return {
    session: { id: session.id, startedAt, endsAt, status: session.status },
    questions: sampled.map(sanitizeQuestionForCandidate),
    candidate: presentCandidatePublic(candidate),
  };
};

const queueReportEmail = ({ candidate, submission }) => {
  setImmediate(async () => {
    try {
      await emailService.sendInterviewReport({ candidate, submission });
      await submissionRepository.updateById(submission.id, { reportEmailedAt: new Date() });
    } catch (err) {
      logger.error('Report email failed', { submissionId: submission.id, err: err.message });
      await submissionRepository.updateById(submission.id, { reportEmailError: err.message });
    }
  });
};

const finalize = async ({ candidate, session, answers, autoSubmitted, cheatDetected, cheatReason }) => {
  const populated = await sessionRepository.findByIdPopulated(session.id);
  const questions = populated.questions || [];
  const evalResult = await evaluationService.evaluateAll({ questions, answers: answers || [] });

  const submission = await submissionRepository.create({
    candidate: candidate.id,
    session: session.id,
    answers: evalResult.answers,
    totalScore: evalResult.totalScore,
    maxScore: evalResult.maxScore,
    percentage: evalResult.percentage,
    autoSubmitted: Boolean(autoSubmitted),
    cheatDetected: Boolean(cheatDetected),
    cheatReason: cheatReason || undefined,
    submittedAt: new Date(),
  });

  await sessionRepository.updateById(session.id, {
    status: cheatDetected ? SESSION_STATUS.CHEATED : autoSubmitted ? SESSION_STATUS.AUTO_SUBMITTED : SESSION_STATUS.SUBMITTED,
    submittedAt: submission.submittedAt,
  });

  candidate.status = cheatDetected ? CANDIDATE_STATUS.CHEATED : CANDIDATE_STATUS.COMPLETED;
  await candidate.save();

  queueReportEmail({ candidate, submission });

  return {
    submissionId: submission.id,
    totalScore: submission.totalScore,
    maxScore: submission.maxScore,
    percentage: submission.percentage,
    autoSubmitted: submission.autoSubmitted,
    cheatDetected: submission.cheatDetected,
  };
};

const submit = async (candidate, { answers }) => {
  const session = await sessionRepository.findByCandidate(candidate.id);
  if (!session) throw ApiError.notFound('Active test session not found');
  if (session.status !== SESSION_STATUS.ACTIVE) {
    throw ApiError.conflict(`Session already ${session.status}`);
  }
  return finalize({ candidate, session, answers, autoSubmitted: false, cheatDetected: false });
};

const autoSubmit = async (candidate, { reason, answers, eventType } = {}) => {
  const session = await sessionRepository.findByCandidate(candidate.id);
  if (!session) throw ApiError.notFound('Active test session not found');
  if (session.status !== SESSION_STATUS.ACTIVE) {
    return {
      submissionId: null,
      totalScore: 0,
      maxScore: 0,
      percentage: 0,
      autoSubmitted: true,
      cheatDetected: session.status === SESSION_STATUS.CHEATED,
      message: `Session already ${session.status}`,
    };
  }
  const cheatType = Object.values(CHEAT_EVENT_TYPES).includes(eventType)
    ? eventType
    : CHEAT_EVENT_TYPES.TAB_SWITCH;
  await sessionRepository.pushCheatEvent(session.id, { type: cheatType, at: new Date() });

  return finalize({
    candidate,
    session,
    answers: answers || [],
    autoSubmitted: true,
    cheatDetected: true,
    cheatReason: reason || `Auto-submitted: ${cheatType}`,
  });
};

module.exports = {
  validateToken,
  uploadPhoto,
  startTest,
  submit,
  autoSubmit,
  sanitizeQuestionForCandidate,
  presentCandidatePublic,
};
