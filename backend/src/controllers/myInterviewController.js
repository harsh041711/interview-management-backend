'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/ApiResponse');
const interviewRepository = require('../repositories/interviewRepository');
const reviewRepository = require('../repositories/reviewRepository');
const editRequestRepository = require('../repositories/reviewEditRequestRepository');
const reviewService = require('../services/reviewService');
const { INTERVIEW_STATUS } = require('../utils/constants');

const list = asyncHandler(async (req, res) => {
  const all = await interviewRepository.list({ interviewerId: req.user.id, limit: 200 });
  const upcoming = [];
  const past = [];
  for (const i of all.items) {
    const obj = i.toObject ? i.toObject() : i;
    if ([INTERVIEW_STATUS.SCHEDULED, INTERVIEW_STATUS.RESCHEDULE_REQUESTED].includes(obj.status)) {
      upcoming.push(obj);
    } else {
      past.push(obj);
    }
  }
  const enriched = await Promise.all(past.map(async (i) => {
    const review = await reviewRepository.findByInterview(i._id || i.id);
    const pending = review ? await editRequestRepository.findPendingForReview(review._id) : null;
    return { ...i, reviewSubmitted: !!review, pendingEditRequest: pending || null };
  }));
  return ok(res, { upcoming, past: enriched }, 'OK');
});

const detail = asyncHandler(async (req, res) => {
  const interview = req.interview;
  const review = await reviewRepository.findByInterview(interview._id || interview.id);
  const pending = review ? await editRequestRepository.findPendingForReview(review._id) : null;
  const approved = review ? await editRequestRepository.findApprovedNotConsumed(review._id) : null;
  const candidateId = interview.candidate && (interview.candidate._id || interview.candidate.id);
  const allReviews = candidateId ? await reviewRepository.findAllByCandidate(candidateId) : [];
  const currentInterviewId = String(interview._id || interview.id);
  const reviewHistory = allReviews
    .filter((r) => String(r.interview) !== currentInterviewId)
    .map((r) => ({ ratings: r.ratings, comments: r.comments, submittedAt: r.submittedAt }));
  return ok(res, {
    interview,
    review: review || null,
    pendingEditRequest: pending || null,
    canEdit: !!approved,
    reviewHistory,
  }, 'OK');
});

const submitReview = asyncHandler(async (req, res) => {
  const review = await reviewService.submit({
    interviewId: req.params.id,
    interviewerId: req.user.id,
    ratings: req.body.ratings,
    comments: req.body.comments,
  });
  return ok(res, { review }, 'Review submitted');
});

const editReview = asyncHandler(async (req, res) => {
  const review = await reviewService.edit({
    reviewId: req.params.reviewId,
    interviewerId: req.user.id,
    ratings: req.body.ratings,
    comments: req.body.comments,
  });
  return ok(res, { review }, 'Review updated');
});

const requestEdit = asyncHandler(async (req, res) => {
  const request = await reviewService.requestEdit({
    reviewId: req.params.reviewId,
    interviewerId: req.user.id,
    reason: req.body.reason,
  });
  return ok(res, { request }, 'Edit requested');
});

module.exports = { list, detail, submitReview, editReview, requestEdit };
