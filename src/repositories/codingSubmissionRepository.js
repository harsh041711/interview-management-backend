'use strict';

const CodingSubmission = require('../models/CodingSubmission');

const create = (data) => CodingSubmission.create(data);

const findById = (id) =>
  CodingSubmission.findById(id).populate('problem');

const findByCandidate = (candidateId) =>
  CodingSubmission.find({ candidate: candidateId }).populate('problem').sort({ createdAt: 1 });

const findByCandidateAndProblem = (candidateId, problemId) =>
  CodingSubmission.findOne({ candidate: candidateId, problem: problemId });

const updateById = (id, update) =>
  CodingSubmission.findByIdAndUpdate(id, update, { new: true });

module.exports = { create, findById, findByCandidate, findByCandidateAndProblem, updateById };
