'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/ApiResponse');
const svc = require('../services/liveCodingTaskService');

const create = asyncHandler(async (req, res) => {
  const task = await svc.create({
    interviewId: req.params.id,
    interviewerId: req.user.id,
    difficulty: req.body.difficulty,
    language: req.body.language,
  });
  return created(res, { task }, 'Coding task sent');
});

const list = asyncHandler(async (req, res) => {
  const tasks = await svc.listForInterview({ interviewId: req.params.id });
  return ok(res, { tasks }, 'OK');
});

const cancel = asyncHandler(async (req, res) => {
  const task = await svc.cancel({ taskId: req.params.taskId, interviewerId: req.user.id });
  return ok(res, { task }, 'Cancelled');
});

const getPublic = asyncHandler(async (req, res) => {
  const task = await svc.getPublic({ token: req.params.token });
  return ok(res, { task }, 'OK');
});

const run = asyncHandler(async (req, res) => {
  const out = await svc.runPublic({ token: req.params.token, code: req.body.code });
  return ok(res, out, 'OK');
});

const submit = asyncHandler(async (req, res) => {
  const out = await svc.submitPublic({ token: req.params.token, code: req.body.code });
  return ok(res, out, 'Submitted');
});

const reportMonitoring = asyncHandler(async (req, res) => {
  const out = await svc.reportMonitoring({
    token: req.params.token,
    tabSwitches: req.body.tabSwitches,
  });
  return ok(res, out, 'OK');
});

module.exports = { create, list, cancel, getPublic, run, submit, reportMonitoring };
