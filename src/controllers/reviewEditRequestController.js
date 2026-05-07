'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/ApiResponse');
const editRequestRepository = require('../repositories/reviewEditRequestRepository');
const reviewService = require('../services/reviewService');

const list = asyncHandler(async (req, res) => {
  const result = await editRequestRepository.list(req.query);
  return ok(res, result, 'OK');
});

const decide = asyncHandler(async (req, res) => {
  const updated = await reviewService.decideEdit({
    requestId: req.params.id,
    decision: req.body.decision,
    note: req.body.note,
    adminId: req.user.id,
  });
  return ok(res, { request: updated }, 'Decided');
});

module.exports = { list, decide };
