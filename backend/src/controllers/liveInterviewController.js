'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/ApiResponse');
const svc = require('../services/liveInterviewService');

const start = asyncHandler(async (req, res) => {
  const session = await svc.start({ interviewId: req.params.id, interviewerId: req.user.id });
  return created(res, { session }, 'Live session ready');
});

const getActive = asyncHandler(async (req, res) => {
  const session = await svc.getActive({ interviewId: req.params.id });
  return ok(res, { session }, 'OK');
});

const updateQuestions = asyncHandler(async (req, res) => {
  const session = await svc.updateQuestions({
    sessionId: req.params.id,
    interviewerId: req.user.id,
    updates: req.body.questionUpdates,
  });
  return ok(res, { session }, 'Updated');
});

const end = asyncHandler(async (req, res) => {
  const session = await svc.end({ sessionId: req.params.id, interviewerId: req.user.id });
  return ok(res, { session }, 'Ended');
});

module.exports = { start, getActive, updateQuestions, end };
