'use strict';
const liveSessionRepository = require('../repositories/liveSessionRepository');
const interviewRepository = require('../repositories/interviewRepository');
const candidateRepository = require('../repositories/candidateRepository');
const reviewRepository = require('../repositories/reviewRepository');
const jdRepository = require('../repositories/jobDescriptionRepository');
const aiService = require('./liveInterviewAiService');
const ApiError = require('../utils/ApiError');

const toObj = (doc) => (doc && typeof doc.toObject === 'function' ? doc.toObject() : doc);

const start = async ({ interviewId, interviewerId }) => {
  const existing = await liveSessionRepository.findActiveByInterview(interviewId);
  if (existing) return toObj(existing);

  const interview = await interviewRepository.findByIdPopulated(interviewId);
  if (!interview) throw ApiError.notFound('Interview not found');

  const candidateId = (interview.candidate && (interview.candidate._id || interview.candidate.id)) || null;
  if (!candidateId) throw ApiError.badRequest('Interview has no candidate');

  const candidate = await candidateRepository.findById(candidateId);
  const jdId = (interview.jobDescription && (interview.jobDescription._id || interview.jobDescription)) || null;
  const jd = jdId ? await jdRepository.findById(jdId) : null;
  const priorReviews = await reviewRepository.findAllByCandidate(candidateId) || [];

  const { questions } = await aiService.generateQuestions({
    candidate: candidate || {},
    jdText: jd ? (jd.text || jd.description || '') : '',
    durationMinutes: interview.durationMinutes || 30,
    priorReviews,
  });

  const session = await liveSessionRepository.create({
    interview: interviewId,
    interviewer: interviewerId,
    candidate: candidateId,
    questions,
  });
  return toObj(session);
};

const getActive = async ({ interviewId }) => {
  const s = await liveSessionRepository.findActiveByInterview(interviewId);
  return s ? toObj(s) : null;
};

const ensureOwnerActive = (session, interviewerId, { allowEnded = false } = {}) => {
  if (!session) throw ApiError.notFound('Session not found');
  if (String(session.interviewer) !== String(interviewerId)) {
    throw ApiError.forbidden('Not your session', { code: 'E_FORBIDDEN' });
  }
  if (!allowEnded && session.endedAt) {
    throw ApiError.conflict('Session already ended', { code: 'E_ALREADY_ENDED' });
  }
};

const updateQuestions = async ({ sessionId, interviewerId, updates }) => {
  const session = await liveSessionRepository.findById(sessionId);
  ensureOwnerActive(session, interviewerId);
  const updated = await liveSessionRepository.applyQuestionUpdates(sessionId, updates || []);
  return toObj(updated);
};

const end = async ({ sessionId, interviewerId }) => {
  const session = await liveSessionRepository.findById(sessionId);
  ensureOwnerActive(session, interviewerId, { allowEnded: true });
  if (session.endedAt) return toObj(session);

  const { draft, provider, model } = await aiService.generateDraftReview({ questions: session.questions || [] });
  const draftReview = {
    knowledge: draft.knowledge,
    communication: draft.communication,
    confidence: draft.confidence,
    comments: draft.comments,
    recommendation: draft.recommendation,
    generatedBy: provider && model ? `${provider}:${model}` : '',
  };
  const updated = await liveSessionRepository.updateById(sessionId, {
    endedAt: new Date(),
    draftReview,
  });
  return toObj(updated);
};

module.exports = { start, getActive, updateQuestions, end };
