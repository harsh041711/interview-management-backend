'use strict';
const liveSessionRepository = require('../repositories/liveSessionRepository');
const interviewRepository = require('../repositories/interviewRepository');
const candidateRepository = require('../repositories/candidateRepository');
const reviewRepository = require('../repositories/reviewRepository');
const aiService = require('./liveInterviewAiService');
const ApiError = require('../utils/ApiError');

const toObj = (doc) => (doc && typeof doc.toObject === 'function' ? doc.toObject() : doc);

// Builds a JD prompt string from the snapshot captured during resume screening
// (lives at candidate.screening.jdSnapshot). The Interview model itself has no
// JD reference — JD context only travels via this snapshot.
const buildJdTextFromSnapshot = (snap) => {
  if (!snap) return '';
  const parts = [];
  if (snap.title) parts.push(`Title: ${snap.title}`);
  if (snap.jobRole) parts.push(`Role: ${snap.jobRole}`);
  if (snap.minYears != null || snap.maxYears != null) {
    parts.push(`Experience: ${snap.minYears ?? '?'}-${snap.maxYears ?? '?'} yrs`);
  }
  if (snap.responsibilities) parts.push(`Responsibilities:\n${snap.responsibilities}`);
  if (snap.qualifications) parts.push(`Qualifications:\n${snap.qualifications}`);
  if (snap.niceToHave) parts.push(`Nice to have:\n${snap.niceToHave}`);
  return parts.join('\n\n');
};

const start = async ({ interviewId, interviewerId }) => {
  const existing = await liveSessionRepository.findActiveByInterview(interviewId);
  if (existing) return toObj(existing);

  const interview = await interviewRepository.findByIdPopulated(interviewId);
  if (!interview) throw ApiError.notFound('Interview not found');

  const candidateId = (interview.candidate && (interview.candidate._id || interview.candidate.id)) || null;
  if (!candidateId) throw ApiError.badRequest('Interview has no candidate');

  const candidate = await candidateRepository.findById(candidateId);
  const jdText = buildJdTextFromSnapshot(candidate?.screening?.jdSnapshot);
  const priorReviews = await reviewRepository.findAllByCandidate(candidateId) || [];

  const { questions } = await aiService.generateQuestions({
    candidate: candidate || {},
    jdText,
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

// Hiring decisions stay human. On end, we surface the interviewer's own
// per-question notes verbatim into the comments field as a starter; star
// ratings are left blank for the interviewer to set manually in the
// ReviewForm. We deliberately do NOT call AI to auto-rate or auto-judge.
const buildNotesDraft = (questions = []) => {
  const asked = questions.filter((q) => q.askedAt);
  if (asked.length === 0) {
    return { knowledge: null, communication: null, confidence: null, comments: '', recommendation: null, generatedBy: '' };
  }
  const comments = asked.map((q, i) => {
    const rating = q.rating != null ? `${q.rating}/5` : '—';
    const note = q.note?.trim() ? q.note.trim() : '—';
    return `Q${i + 1}: ${q.text}\nNote: ${note}\nRating: ${rating}`;
  }).join('\n\n').slice(0, 4000);
  return { knowledge: null, communication: null, confidence: null, comments, recommendation: null, generatedBy: '' };
};

const end = async ({ sessionId, interviewerId }) => {
  const session = await liveSessionRepository.findById(sessionId);
  ensureOwnerActive(session, interviewerId, { allowEnded: true });
  if (session.endedAt) return toObj(session);

  const draftReview = buildNotesDraft(session.questions || []);
  const updated = await liveSessionRepository.updateById(sessionId, {
    endedAt: new Date(),
    draftReview,
  });
  return toObj(updated);
};

module.exports = { start, getActive, updateQuestions, end };
