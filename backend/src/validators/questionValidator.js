'use strict';

const Joi = require('joi');
const {
  QUESTION_TYPES,
  QUESTION_TYPE_LIST,
  DIFFICULTY_LIST,
} = require('../utils/constants');

const objectId = Joi.string().hex().length(24);

const baseQuestion = {
  techStack: Joi.string().min(1).max(60).required(),
  type: Joi.string().valid(...QUESTION_TYPE_LIST).required(),
  question: Joi.string().min(5).max(2000).required(),
  marks: Joi.number().min(0.25).max(50).default(1),
  difficulty: Joi.string().valid(...DIFFICULTY_LIST).default('medium'),
  rubric: Joi.string().max(2000).optional(),
};

const createQuestionSchema = {
  body: Joi.object({
    ...baseQuestion,
    options: Joi.array().items(Joi.string().min(1)).min(2).max(8).when('type', {
      is: Joi.string().valid(QUESTION_TYPES.MCQ, QUESTION_TYPES.MULTI_SELECT),
      then: Joi.required(),
      otherwise: Joi.forbidden(),
    }),
    correctAnswer: Joi.alternatives()
      .conditional('type', [
        { is: QUESTION_TYPES.MCQ, then: Joi.string().min(1).required() },
        { is: QUESTION_TYPES.MULTI_SELECT, then: Joi.array().items(Joi.string().min(1)).min(1).required() },
        { is: QUESTION_TYPES.ONE_LINE, then: Joi.string().min(1).max(300).required() },
        { is: QUESTION_TYPES.DESCRIPTIVE, then: Joi.string().max(2000).optional() },
      ]),
    keywords: Joi.array().items(Joi.string().min(1)).max(20).when('type', {
      is: QUESTION_TYPES.ONE_LINE,
      then: Joi.optional(),
      otherwise: Joi.forbidden(),
    }),
  }),
};

const updateQuestionSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    ...baseQuestion,
    techStack: baseQuestion.techStack.optional(),
    type: baseQuestion.type.optional(),
    question: baseQuestion.question.optional(),
    options: Joi.array().items(Joi.string()).optional(),
    correctAnswer: Joi.any().optional(),
    keywords: Joi.array().items(Joi.string()).optional(),
    isActive: Joi.boolean().optional(),
  }).min(1),
};

const bulkSchema = {
  body: Joi.object({
    questions: Joi.array().items(createQuestionSchema.body).min(1).max(100).required(),
  }),
};

const generateSchema = {
  body: Joi.object({
    techStack: Joi.string().min(1).max(60).required(),
    count: Joi.number().integer().min(1).max(20).default(10),
    types: Joi.array().items(Joi.string().valid(...QUESTION_TYPE_LIST)).optional(),
    difficulty: Joi.string().valid(...DIFFICULTY_LIST).optional(),
    persist: Joi.boolean().default(true),
  }),
};

const listSchema = {
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    techStack: Joi.string().empty('').optional(),
    type: Joi.string().valid(...QUESTION_TYPE_LIST).empty('').optional(),
    difficulty: Joi.string().valid(...DIFFICULTY_LIST).empty('').optional(),
    isActive: Joi.boolean().optional(),
  }),
};

const idParamSchema = { params: Joi.object({ id: objectId.required() }) };

module.exports = {
  createQuestionSchema,
  updateQuestionSchema,
  bulkSchema,
  generateSchema,
  listSchema,
  idParamSchema,
};
