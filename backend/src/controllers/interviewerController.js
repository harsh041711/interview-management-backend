'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { ok, created, noContent } = require('../utils/ApiResponse');
const interviewerService = require('../services/interviewerService');

const createInterviewer = asyncHandler(async (req, res) => {
  const interviewer = await interviewerService.create(req.body, req.admin.id);
  return created(res, { interviewer }, 'Interviewer created');
});

const listInterviewers = asyncHandler(async (req, res) => {
  const result = await interviewerService.list(req.query);
  return ok(res, result, 'Interviewers fetched');
});

const getInterviewer = asyncHandler(async (req, res) => {
  const interviewer = await interviewerService.detail(req.params.id);
  return ok(res, { interviewer }, 'Interviewer fetched');
});

const updateInterviewer = asyncHandler(async (req, res) => {
  const interviewer = await interviewerService.update(req.params.id, req.body);
  return ok(res, { interviewer }, 'Interviewer updated');
});

const deleteInterviewer = asyncHandler(async (req, res) => {
  await interviewerService.remove(req.params.id);
  return noContent(res);
});

module.exports = {
  createInterviewer,
  listInterviewers,
  getInterviewer,
  updateInterviewer,
  deleteInterviewer,
};
