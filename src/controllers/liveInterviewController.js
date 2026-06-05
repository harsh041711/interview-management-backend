'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/ApiResponse');
const svc = require('../services/liveInterviewService');
const aiSvc = require('../services/liveInterviewAiService');

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

// Post-interview: returns the LATEST live session (even if ended) so the
// detail page can surface the per-question notes in a separate modal —
// distinct from getActive which only returns sessions with endedAt=null.
const getLatest = asyncHandler(async (req, res) => {
  const session = await svc.getLatestForInterview({ interviewId: req.params.id });
  return ok(res, { session }, 'OK');
});

const suggestFollowUps = asyncHandler(async (req, res) => {
  const out = await aiSvc.suggestFollowUps({
    questionText: req.body.questionText,
    note: req.body.note,
    topic: req.body.topic,
    difficulty: req.body.difficulty,
  });
  return ok(res, out, 'OK');
});

module.exports = { start, getActive, updateQuestions, end, getLatest, suggestFollowUps };
