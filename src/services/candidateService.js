'use strict';

const path = require('path');
const candidateRepository = require('../repositories/candidateRepository');
const submissionRepository = require('../repositories/submissionRepository');
const interviewRepository = require('../repositories/interviewRepository');
const rescheduleRequestRepository = require('../repositories/rescheduleRequestRepository');
const reviewRepository = require('../repositories/reviewRepository');
const { generateTestToken } = require('../utils/tokenGenerator');
const { destroyAsset, uploadBufferToCloudinary } = require('./uploadService');
const emailService = require('./emailService');
const jdService = require('./jobDescriptionService');
const resumeScreeningService = require('./resumeScreeningService');
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
  screening: candidate.screening
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
  if (candidate.status === CANDIDATE_STATUS.RESUME_PENDING && !candidate.screening) {
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
  candidate.status = CANDIDATE_STATUS.PENDING;
  await candidate.save();

  // Re-use the existing invite email pipeline.
  queueInviteEmail(candidate);
  return presentCandidate(candidate);
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
};
