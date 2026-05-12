'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/ApiResponse');
const codingSubService = require('../services/codingSubmissionService');

const listForCandidate = asyncHandler(async (req, res) => {
  const subs = await codingSubService.listForCandidate(req.query.candidateId);
  return ok(res, { items: subs });
});

const rate = asyncHandler(async (req, res) => {
  const sub = await codingSubService.rate(req.params.id, req.body, req.admin.id);
  return ok(res, sub, 'Rating saved');
});

const rerun = asyncHandler(async (req, res) => {
  const sub = await codingSubService.rerun(req.params.id);
  return ok(res, sub, 'Re-run complete');
});

module.exports = { listForCandidate, rate, rerun };
