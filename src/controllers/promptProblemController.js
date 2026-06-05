'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const problemRepo = require('../repositories/promptProblemRepository');
const PromptSubmission = require('../models/PromptSubmission');
const { PROMPT_PROBLEM_SOURCE } = require('../utils/constants');

const create = asyncHandler(async (req, res) => {
  const problem = await problemRepo.create({
    ...req.body,
    source: PROMPT_PROBLEM_SOURCE.MANUAL,
    createdFor: null,
    createdBy: req.admin.id,
  });
  return created(res, { problem }, 'Created');
});

const list = asyncHandler(async (req, res) => {
  const result = await problemRepo.listLibrary(req.query);
  return ok(res, result, 'OK');
});

const detail = asyncHandler(async (req, res) => {
  const problem = await problemRepo.findById(req.params.id);
  if (!problem) throw ApiError.notFound('Not found');
  return ok(res, { problem }, 'OK');
});

const update = asyncHandler(async (req, res) => {
  const problem = await problemRepo.updateById(req.params.id, req.body);
  if (!problem) throw ApiError.notFound('Not found');
  return ok(res, { problem }, 'Updated');
});

const remove = asyncHandler(async (req, res) => {
  const used = await PromptSubmission.exists({ promptProblem: req.params.id });
  if (used) throw ApiError.conflict('Problem in use — cannot delete', { code: 'E_PROBLEM_IN_USE' });
  await problemRepo.deleteById(req.params.id);
  return ok(res, {}, 'Deleted');
});

module.exports = { create, list, detail, update, remove };
