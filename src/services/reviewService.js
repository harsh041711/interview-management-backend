'use strict';

const reviewRepository = require('../repositories/reviewRepository');
const editRequestRepository = require('../repositories/reviewEditRequestRepository');
const interviewRepository = require('../repositories/interviewRepository');
const candidateRepository = require('../repositories/candidateRepository');
const emailService = require('./emailService');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const { CANDIDATE_STATUS, INTERVIEW_STATUS, REVIEW_EDIT_STATUS } = require('../utils/constants');

const submit = async ({ interviewId, interviewerId, ratings, comments }) => {
  const interview = await interviewRepository.findByIdPopulated(interviewId);
  if (!interview) throw ApiError.notFound('Interview not found');

  const interviewerOnInterview = interview.interviewer && (interview.interviewer._id || interview.interviewer);
  if (String(interviewerOnInterview) !== String(interviewerId)) {
    throw ApiError.forbidden('Not your interview', { code: 'E_FORBIDDEN' });
  }

  if (interview.status !== INTERVIEW_STATUS.COMPLETED) {
    throw ApiError.conflict('Interview must be completed first', { code: 'E_INTERVIEW_NOT_COMPLETED' });
  }

  const existing = await reviewRepository.findByInterview(interviewId);
  if (existing) throw ApiError.conflict('Review already submitted', { code: 'E_REVIEW_EXISTS' });

  const candidateId = interview.candidate._id || interview.candidate;
  const review = await reviewRepository.create({
    interview: interviewId,
    interviewer: interviewerId,
    candidate: candidateId,
    ratings,
    comments,
    submittedAt: new Date(),
    createdBy: interviewerId,
  });

  const candidate = await candidateRepository.findById(candidateId);
  if (candidate && candidate.status === CANDIDATE_STATUS.SHORTLISTED) {
    candidate.status = CANDIDATE_STATUS.AWAITING_DECISION;
    await candidate.save();
  }

  setImmediate(async () => {
    try {
      if (typeof emailService.sendReviewSubmitted === 'function') {
        await emailService.sendReviewSubmitted({ review, candidate, interviewer: interview.interviewer });
      }
    } catch (err) {
      logger.error('Review submitted email failed', { err: err.message });
    }
  });

  return review;
};

const edit = async ({ reviewId, interviewerId, ratings, comments }) => {
  const review = await reviewRepository.findByIdRaw(reviewId);
  if (!review) throw ApiError.notFound('Review not found');

  if (String(review.interviewer) !== String(interviewerId)) {
    throw ApiError.forbidden('Not your review', { code: 'E_FORBIDDEN' });
  }

  const approval = await editRequestRepository.findApprovedNotConsumed(reviewId);
  if (!approval) {
    throw ApiError.forbidden('Edit not approved', { code: 'E_EDIT_NOT_APPROVED' });
  }

  if (ratings) review.ratings = ratings;
  if (comments) review.comments = comments;
  review.editCount = (review.editCount || 0) + 1;
  review.lastEditedAt = new Date();
  await review.save();

  approval.consumed = true;
  await approval.save();

  setImmediate(async () => {
    try {
      if (typeof emailService.sendReviewEdited === 'function') {
        const populated = await reviewRepository.findById(reviewId);
        if (populated) {
          await emailService.sendReviewEdited({
            review: populated, candidate: populated.candidate, interviewer: populated.interviewer,
          });
        }
      }
    } catch (err) {
      logger.error('Review edited email failed', { err: err.message });
    }
  });

  return review;
};

const requestEdit = async ({ reviewId, interviewerId, reason }) => {
  const review = await reviewRepository.findByIdRaw(reviewId);
  if (!review) throw ApiError.notFound('Review not found');

  if (String(review.interviewer) !== String(interviewerId)) {
    throw ApiError.forbidden('Not your review', { code: 'E_FORBIDDEN' });
  }

  const pending = await editRequestRepository.findPendingForReview(reviewId);
  if (pending) throw ApiError.conflict('Edit request pending', { code: 'E_EDIT_REQUEST_PENDING' });

  const request = await editRequestRepository.create({
    review: reviewId, interviewer: interviewerId, reason: reason || null,
    status: REVIEW_EDIT_STATUS.PENDING,
  });

  setImmediate(async () => {
    try {
      if (typeof emailService.sendEditRequestSubmitted === 'function') {
        const populated = await editRequestRepository.findById(request.id || request._id);
        if (populated) await emailService.sendEditRequestSubmitted({ request: populated });
      }
    } catch (err) {
      logger.error('Edit-request email failed', { err: err.message });
    }
  });

  return request;
};

const decideEdit = async ({ requestId, decision, note, adminId }) => {
  const request = await editRequestRepository.findById(requestId);
  if (!request) throw ApiError.notFound('Request not found');

  if (request.status !== REVIEW_EDIT_STATUS.PENDING) {
    throw ApiError.conflict('Request already decided', { code: 'E_ALREADY_DECIDED' });
  }

  const updated = await editRequestRepository.updateById(requestId, {
    status: decision, decidedBy: adminId, decidedAt: new Date(), decisionNote: note || null,
  });

  setImmediate(async () => {
    try {
      const populated = await editRequestRepository.findById(updated.id || updated._id);
      if (decision === REVIEW_EDIT_STATUS.APPROVED) {
        if (typeof emailService.sendEditRequestApproved === 'function') {
          await emailService.sendEditRequestApproved({ request: populated });
        }
      } else if (typeof emailService.sendEditRequestRejected === 'function') {
        await emailService.sendEditRequestRejected({ request: populated });
      }
    } catch (err) {
      logger.error('Edit decision email failed', { err: err.message });
    }
  });

  return updated;
};

module.exports = { submit, edit, requestEdit, decideEdit };
