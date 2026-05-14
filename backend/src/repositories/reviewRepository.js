'use strict';
const Review = require('../models/Review');

const create = (data) => Review.create(data);
const findById = (id) => Review.findById(id).populate('candidate').populate('interviewer');
const findByIdRaw = (id) => Review.findById(id);
const findByInterview = (interviewId) =>
  Review.findOne({ interview: interviewId }).populate('interviewer');
const findByCandidate = (candidateId) => Review.findOne({ candidate: candidateId }).populate('interviewer');
const updateById = (id, patch) => Review.findByIdAndUpdate(id, patch, { new: true });

module.exports = { create, findById, findByIdRaw, findByInterview, findByCandidate, updateById };
