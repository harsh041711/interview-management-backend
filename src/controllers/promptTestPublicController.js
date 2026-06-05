'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/ApiResponse');
const svc = require('../services/promptTestService');

const fetch = asyncHandler(async (req, res) => {
  const data = await svc.getByToken(req.params.token);
  return ok(res, data, 'OK');
});

const preview = asyncHandler(async (req, res) => {
  const result = await svc.preview({ token: req.params.token, candidatePrompt: req.body.prompt });
  return ok(res, result, 'OK');
});

const submit = asyncHandler(async (req, res) => {
  const result = await svc.submit({ token: req.params.token, candidatePrompt: req.body.prompt });
  return ok(res, result, 'Submitted');
});

module.exports = { fetch, preview, submit };
