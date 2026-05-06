'use strict';

const candidateRepository = require('../repositories/candidateRepository');
const submissionRepository = require('../repositories/submissionRepository');
const interviewRepository = require('../repositories/interviewRepository');
const rescheduleRequestRepository = require('../repositories/rescheduleRequestRepository');
const { generateTestToken } = require('../utils/tokenGenerator');
const { destroyAsset } = require('./uploadService');
const emailService = require('./emailService');
const ApiError = require('../utils/ApiError');
const env = require('../config/env');
const logger = require('../config/logger');
const { CANDIDATE_STATUS } = require('../utils/constants');

const buildTestUrl = (token) => {
  const base = env.frontendUrl.replace(/\/$/, '');
  return `${base}/test/${token}`;
};

const presentCandidate = (candidate) => ({
  id: candidate.id,
  name: candidate.name,
  email: candidate.email,
  techStack: candidate.techStack,
  status: candidate.status,
  questionCount: candidate.questionCount,
  durationMinutes: candidate.durationMinutes,
  photoUrl: candidate.photoUrl,
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

const createCandidate = async ({ name, email, techStack, questionCount, durationMinutes }, adminId) => {
  const { token, expiresAt } = generateTestToken();
  const finalCount = Number.isFinite(questionCount) ? questionCount : 10;
  const finalDuration = Number.isFinite(durationMinutes)
    ? durationMinutes
    : computeDuration(finalCount);
  const candidate = await candidateRepository.create({
    name,
    email,
    techStack,
    questionCount: finalCount,
    durationMinutes: finalDuration,
    testToken: token,
    tokenExpiresAt: expiresAt,
    createdBy: adminId,
  });
  queueInviteEmail(candidate);
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

const detail = async (id) => {
  const candidate = await candidateRepository.findById(id);
  if (!candidate) throw ApiError.notFound('Candidate not found');
  const submission = await submissionRepository.findByCandidate(id);
  return { candidate: presentCandidate(candidate), submission };
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
  await candidateRepository.deleteById(id);
  return { id };
};

const stats = async () => candidateRepository.countByStatus();

module.exports = {
  createCandidate,
  regenerateToken,
  resendInvite,
  list,
  detail,
  remove,
  stats,
  presentCandidate,
  buildTestUrl,
};
