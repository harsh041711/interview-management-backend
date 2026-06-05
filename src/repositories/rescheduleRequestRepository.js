'use strict';

const RescheduleRequest = require('../models/RescheduleRequest');
const { RESCHEDULE_STATUS } = require('../utils/constants');

const create = (data) => RescheduleRequest.create(data);

/**
 * Returns the latest pending reschedule request for the interview, or null.
 */
const findPendingForInterview = (interviewId) =>
  RescheduleRequest.findOne({
    interview: interviewId,
    status: RESCHEDULE_STATUS.PENDING,
  }).sort({ createdAt: -1 });

/**
 * Returns full reschedule request history for an interview, newest first.
 */
const findByInterview = (interviewId) =>
  RescheduleRequest.find({ interview: interviewId }).sort({ createdAt: -1 });

const updateById = (id, update) =>
  RescheduleRequest.findByIdAndUpdate(id, update, { new: true });

/**
 * Delete all reschedule requests for an interview (cascade).
 */
const deleteByInterview = (interviewId) =>
  RescheduleRequest.deleteMany({ interview: interviewId });

module.exports = {
  create,
  findPendingForInterview,
  findByInterview,
  updateById,
  deleteByInterview,
};
