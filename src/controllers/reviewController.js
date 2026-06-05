'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/ApiResponse');
const reviewRepository = require('../repositories/reviewRepository');
const editRequestRepository = require('../repositories/reviewEditRequestRepository');
const ApiError = require('../utils/ApiError');

const getByCandidate = asyncHandler(async (req, res) => {
  const review = await reviewRepository.findByCandidate(req.query.candidate);
  if (!review) return ok(res, { review: null, history: [] }, 'OK');
  const history = await editRequestRepository.findHistory(review.id || review._id);
  return ok(res, { review, history }, 'OK');
});

const getOne = asyncHandler(async (req, res) => {
  const review = await reviewRepository.findById(req.params.id);
  if (!review) throw ApiError.notFound('Review not found');
  const history = await editRequestRepository.findHistory(review.id || review._id);
  return ok(res, { review, history }, 'OK');
});

module.exports = { getByCandidate, getOne };
