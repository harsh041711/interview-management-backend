'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/ApiResponse');
const interviewService = require('../services/interviewService');

const scheduleInterview = asyncHandler(async (req, res) => {
  const interview = await interviewService.schedule(req.body, req.admin.id);
  return created(res, { interview }, 'Interview scheduled');
});

const listInterviews = asyncHandler(async (req, res) => {
  const result = await interviewService.list(req.query);
  return ok(res, result, 'Interviews fetched');
});

const getInterview = asyncHandler(async (req, res) => {
  const { interview, pendingReschedule, rescheduleHistory, review, reviewHistory } =
    await interviewService.detail(req.params.id);
  return ok(
    res,
    { interview, pendingReschedule, rescheduleHistory, review, reviewHistory },
    'Interview fetched',
  );
});

const updateInterview = asyncHandler(async (req, res) => {
  const interview = await interviewService.update(req.params.id, req.body, req.admin.id);
  return ok(res, { interview }, 'Interview updated');
});

const cancelInterview = asyncHandler(async (req, res) => {
  const interview = await interviewService.cancel(req.params.id, req.body, req.admin.id);
  return ok(res, { interview }, 'Interview cancelled');
});

const completeInterview = asyncHandler(async (req, res) => {
  const interview = await interviewService.complete(req.params.id, req.body);
  return ok(res, { interview }, 'Interview completed');
});

const decideReschedule = asyncHandler(async (req, res) => {
  const { request: rescheduleRequest, interview } = await interviewService.decideReschedule(
    req.params.id,
    req.body,
    req.admin.id,
  );
  return ok(res, { rescheduleRequest, interview }, 'Reschedule decision recorded');
});

module.exports = {
  scheduleInterview,
  listInterviews,
  getInterview,
  updateInterview,
  cancelInterview,
  completeInterview,
  decideReschedule,
};
