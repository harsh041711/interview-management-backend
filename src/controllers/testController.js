'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const testService = require('../services/testService');

const validate = asyncHandler(async (req, res) => {
  const result = await testService.validateToken(req.candidate);
  return ok(res, result, 'Token valid');
});

const uploadPhoto = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('Photo file is required');
  const result = await testService.uploadPhoto(req.candidate, req.file);
  return ok(res, result, 'Photo uploaded');
});

const startTest = asyncHandler(async (req, res) => {
  const result = await testService.startTest(req.candidate, {
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });
  return ok(res, result, 'Test started');
});

const submitTest = asyncHandler(async (req, res) => {
  const result = await testService.submit(req.candidate, req.body);
  return ok(res, result, 'Test submitted');
});

const autoSubmitTest = asyncHandler(async (req, res) => {
  const result = await testService.autoSubmit(req.candidate, req.body);
  return ok(res, result, 'Test auto-submitted');
});

module.exports = { validate, uploadPhoto, startTest, submitTest, autoSubmitTest };
