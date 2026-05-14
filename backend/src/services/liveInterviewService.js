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
  const priorReviews = await reviewRepository.findByCandidate(candidateId) || [];

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

module.exports = { start };
