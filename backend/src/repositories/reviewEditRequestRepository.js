'use strict';
const ReviewEditRequest = require('../models/ReviewEditRequest');
const { REVIEW_EDIT_STATUS } = require('../utils/constants');

const create = (data) => ReviewEditRequest.create(data);
const findById = (id) => ReviewEditRequest.findById(id).populate({ path: 'review', populate: ['candidate', 'interviewer'] });
const findPendingForReview = (reviewId) =>
  ReviewEditRequest.findOne({ review: reviewId, status: REVIEW_EDIT_STATUS.PENDING });
const findApprovedNotConsumed = (reviewId) =>
  ReviewEditRequest.findOne({ review: reviewId, status: REVIEW_EDIT_STATUS.APPROVED, consumed: false });
const findHistory = (reviewId) =>
  ReviewEditRequest.find({ review: reviewId }).sort({ createdAt: -1 });
const list = async ({ page = 1, limit = 20, status } = {}) => {
  const filter = {};
  if (status) filter.status = status;
  const skip = (Math.max(1, page) - 1) * limit;
  const [items, total] = await Promise.all([
    ReviewEditRequest.find(filter)
      .populate({ path: 'review', populate: ['candidate', 'interviewer'] })
      .sort({ createdAt: -1 }).skip(skip).limit(limit),
    ReviewEditRequest.countDocuments(filter),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
};
const updateById = (id, patch) => ReviewEditRequest.findByIdAndUpdate(id, patch, { new: true });

module.exports = { create, findById, findPendingForReview, findApprovedNotConsumed, findHistory, list, updateById };
