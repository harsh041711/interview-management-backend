'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/ApiResponse');
const cpService = require('../services/codingProblemService');
const cpAi = require('../services/codingProblemAiService');
const ApiError = require('../utils/ApiError');

const createProblem = asyncHandler(async (req, res) => {
  const p = await cpService.create(req.body, req.admin.id);
  return created(res, p, 'Coding problem created');
});

const listProblems = asyncHandler(async (req, res) => {
  const result = await cpService.list(req.query);
  return ok(res, result);
});

const getProblem = asyncHandler(async (req, res) => {
  const p = await cpService.detail(req.params.id);
  return ok(res, p);
});

const updateProblem = asyncHandler(async (req, res) => {
  const p = await cpService.update(req.params.id, req.body);
  return ok(res, p, 'Coding problem updated');
});

const deactivateProblem = asyncHandler(async (req, res) => {
  const p = await cpService.deactivate(req.params.id);
  return ok(res, p, 'Coding problem deactivated');
});

const aiStarterCode = asyncHandler(async (req, res) => {
  const { description, language } = req.body;
  const code = await cpAi.generateStarterCode({ description, language });
  if (!code) throw ApiError.serviceUnavailable('AI providers unavailable', { code: 'E_AI_UNAVAILABLE' });
  return ok(res, { code });
});

const aiFullProblem = asyncHandler(async (req, res) => {
  const draft = await cpAi.generateFullProblem(req.body);
  if (!draft) throw ApiError.serviceUnavailable('AI providers unavailable', { code: 'E_AI_UNAVAILABLE' });
  return ok(res, draft);
});

module.exports = {
  createProblem, listProblems, getProblem, updateProblem, deactivateProblem,
  aiStarterCode, aiFullProblem,
};
