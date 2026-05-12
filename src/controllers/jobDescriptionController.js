'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/ApiResponse');
const jdService = require('../services/jobDescriptionService');

const createJd = asyncHandler(async (req, res) => {
  const jd = await jdService.create(req.body, req.admin.id);
  return created(res, jd, 'JD created');
});

const listJds = asyncHandler(async (req, res) => {
  const result = await jdService.list(req.query);
  return ok(res, result);
});

const getJd = asyncHandler(async (req, res) => {
  const jd = await jdService.detail(req.params.id);
  return ok(res, jd);
});

const updateJd = asyncHandler(async (req, res) => {
  const jd = await jdService.update(req.params.id, req.body);
  return ok(res, jd, 'JD updated');
});

const deactivateJd = asyncHandler(async (req, res) => {
  const jd = await jdService.deactivate(req.params.id);
  return ok(res, jd, 'JD deactivated');
});

const lookupJd = asyncHandler(async (req, res) => {
  const { techStack, experience } = req.query;
  const jd = await jdService.lookup(techStack, experience);
  return ok(res, jd);
});

module.exports = {
  createJd,
  listJds,
  getJd,
  updateJd,
  deactivateJd,
  lookupJd,
};
