'use strict';

const Submission = require('../models/Submission');

const create = (data) => Submission.create(data);

const findById = (id) =>
  Submission.findById(id)
    .populate('candidate')
    .populate('session')
    .populate('answers.question');

const findByCandidate = (candidateId) =>
  Submission.findOne({ candidate: candidateId })
    .populate('candidate')
    .populate('answers.question');

const list = async ({ page = 1, limit = 20, candidateId } = {}) => {
  const filter = {};
  if (candidateId) filter.candidate = candidateId;
  const skip = (Math.max(1, page) - 1) * limit;
  const [items, total] = await Promise.all([
    Submission.find(filter)
      .sort({ submittedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('candidate', 'name email techStack status photoUrl'),
    Submission.countDocuments(filter),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
};

const updateById = (id, update) => Submission.findByIdAndUpdate(id, update, { new: true });

module.exports = { create, findById, findByCandidate, list, updateById };
