'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/ApiResponse');
const codingSubService = require('../services/codingSubmissionService');

const loadTest = asyncHandler(async (req, res) => {
  const data = await codingSubService.loadTestByToken(req.params.token);
  codingSubService.markFirstOpened(req.params.token).catch(() => {});
  return ok(res, data);
});

const submit = asyncHandler(async (req, res) => {
  const result = await codingSubService.submitByToken({
    token: req.params.token,
    submissions: req.body.submissions,
    tabSwitches: req.body.tabSwitches,
    autoSubmitted: req.body.autoSubmitted,
  });
  return ok(res, result, 'Coding test submitted');
});

module.exports = { loadTest, submit };
