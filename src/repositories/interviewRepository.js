'use strict';

const mongoose = require('mongoose');
const Interview = require('../models/Interview');
const { INTERVIEW_STATUS } = require('../utils/constants');

const ACTIVE_STATUSES = [INTERVIEW_STATUS.SCHEDULED, INTERVIEW_STATUS.RESCHEDULE_REQUESTED];

const create = (data) => Interview.create(data);

const findById = (id) => Interview.findById(id);

const findByIdPopulated = (id) =>
  Interview.findById(id).populate('candidate').populate('interviewer');

const findByCandidateAccessToken = (token) =>
  Interview.findOne({ candidateAccessToken: token });

const findByInterviewerAccessToken = (token) =>
  Interview.findOne({ interviewerAccessToken: token });

const updateById = (id, update) =>
  Interview.findByIdAndUpdate(id, update, { new: true });

const deleteById = (id) => Interview.findByIdAndDelete(id);

const countByInterviewer = (interviewerId, statuses) => {
  const filter = { interviewer: interviewerId };
  if (Array.isArray(statuses) && statuses.length) {
    filter.status = { $in: statuses };
  }
  return Interview.countDocuments(filter);
};

const countByCandidate = (candidateId) =>
  Interview.countDocuments({ candidate: candidateId });

// Latest interview (any status) for a candidate — used by multi-round scheduling
// to compute the next round number and verify the previous round's completion.
const findLatestByCandidate = (candidateId) =>
  Interview.findOne({ candidate: candidateId }).sort({ round: -1, scheduledAt: -1 });

const list = async ({
  page = 1,
  limit = 20,
  status,
  candidateId,
  interviewerId,
  from,
  to,
} = {}) => {
  const filter = {};
  if (status) filter.status = status;
  if (candidateId) filter.candidate = candidateId;
  if (interviewerId) filter.interviewer = interviewerId;
  if (from || to) {
    filter.scheduledAt = {};
    if (from) filter.scheduledAt.$gte = new Date(from);
    if (to) filter.scheduledAt.$lte = new Date(to);
  }
  const skip = (Math.max(1, page) - 1) * limit;
  const [items, total] = await Promise.all([
    Interview.find(filter)
      .populate('candidate')
      .populate('interviewer')
      .sort({ scheduledAt: -1 })
      .skip(skip)
      .limit(limit),
    Interview.countDocuments(filter),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
};

/**
 * Find overlapping interviews for an interviewer.
 * An overlap exists when:
 *   interviewer = id, _id != excludeInterviewId (if given),
 *   status in [scheduled, reschedule_requested],
 *   scheduledAt < end  AND  scheduledAt + durationMinutes*60000 > start
 */
const findOverlapping = async ({ interviewerId, start, end, excludeInterviewId } = {}) => {
  const match = {
    interviewer: new mongoose.Types.ObjectId(interviewerId),
    status: { $in: ACTIVE_STATUSES },
    $expr: {
      $and: [
        { $lt: ['$scheduledAt', new Date(end)] },
        {
          $gt: [
            {
              $add: [
                '$scheduledAt',
                { $multiply: ['$durationMinutes', 60000] },
              ],
            },
            new Date(start),
          ],
        },
      ],
    },
  };

  if (excludeInterviewId) {
    match._id = { $ne: new mongoose.Types.ObjectId(excludeInterviewId) };
  }

  const results = await Interview.aggregate([{ $match: match }, { $limit: 1 }]);
  return results[0] || null;
};

module.exports = {
  create,
  findById,
  findByIdPopulated,
  findByCandidateAccessToken,
  findByInterviewerAccessToken,
  updateById,
  deleteById,
  countByInterviewer,
  countByCandidate,
  findLatestByCandidate,
  list,
  findOverlapping,
};
