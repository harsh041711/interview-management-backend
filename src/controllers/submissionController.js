'use strict';

const Joi = require('joi');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/ApiResponse');
const submissionService = require('../services/submissionService');

const listSubmissions = asyncHandler(async (req, res) => {
  const result = await submissionService.list(req.query);
  return ok(res, result, 'Submissions fetched');
});

const getSubmission = asyncHandler(async (req, res) => {
  const submission = await submissionService.detail(req.params.id);
  return ok(res, { submission }, 'Submission fetched');
});

const getByCandidate = asyncHandler(async (req, res) => {
  const submission = await submissionService.findByCandidate(req.params.candidateId);
  return ok(res, { submission }, 'Submission fetched');
});

const querySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  candidateId: Joi.string().hex().length(24).optional(),
});

const idParamSchema = Joi.object({ id: Joi.string().hex().length(24).required() });
const candidateIdParamSchema = Joi.object({ candidateId: Joi.string().hex().length(24).required() });

module.exports = {
  listSubmissions,
  getSubmission,
  getByCandidate,
  schemas: {
    list: { query: querySchema },
    id: { params: idParamSchema },
    candidateId: { params: candidateIdParamSchema },
  },
};
