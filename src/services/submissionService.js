'use strict';

const submissionRepository = require('../repositories/submissionRepository');
const ApiError = require('../utils/ApiError');

const list = (query) => submissionRepository.list(query);

const detail = async (id) => {
  const submission = await submissionRepository.findById(id);
  if (!submission) throw ApiError.notFound('Submission not found');
  return submission;
};

const findByCandidate = async (candidateId) => {
  const submission = await submissionRepository.findByCandidate(candidateId);
  if (!submission) throw ApiError.notFound('Submission not found for candidate');
  return submission;
};

module.exports = { list, detail, findByCandidate };
