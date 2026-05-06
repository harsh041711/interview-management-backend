'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { ok, created, noContent } = require('../utils/ApiResponse');
const questionService = require('../services/questionService');

const createQuestion = asyncHandler(async (req, res) => {
  const question = await questionService.create(req.body, req.admin.id);
  return created(res, { question }, 'Question created');
});

const bulkCreate = asyncHandler(async (req, res) => {
  const questions = await questionService.bulkCreate(req.body.questions, req.admin.id);
  return created(res, { questions, count: questions.length }, 'Questions created');
});

const generateQuestions = asyncHandler(async (req, res) => {
  const result = await questionService.generateAndSave(req.body, req.admin.id);
  const message = result.source === 'manual_fallback'
    ? 'AI unavailable — returned matching HR-curated questions'
    : 'Questions generated';
  return created(res, result, message);
});

const listQuestions = asyncHandler(async (req, res) => {
  const result = await questionService.list(req.query);
  return ok(res, result, 'Questions fetched');
});

const listTechStacks = asyncHandler(async (_req, res) => {
  const stacks = await questionService.listTechStacks();
  return ok(res, { techStacks: stacks }, 'Tech stacks fetched');
});

const updateQuestion = asyncHandler(async (req, res) => {
  const question = await questionService.update(req.params.id, req.body);
  return ok(res, { question }, 'Question updated');
});

const deleteQuestion = asyncHandler(async (req, res) => {
  await questionService.remove(req.params.id);
  return noContent(res);
});

module.exports = {
  createQuestion,
  bulkCreate,
  generateQuestions,
  listQuestions,
  listTechStacks,
  updateQuestion,
  deleteQuestion,
};
