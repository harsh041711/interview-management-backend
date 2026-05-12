'use strict';

const Joi = require('joi');

const objectId = Joi.string().hex().length(24);

const testCaseField = Joi.object({
  stdin: Joi.string().allow('').max(5000).default(''),
  expectedStdout: Joi.string().allow('').max(5000).default(''),
  isHidden: Joi.boolean().default(true),
});

const baseFields = {
  title: Joi.string().min(2).max(200).required(),
  description: Joi.string().min(10).max(10000).required(),
  difficulty: Joi.string().valid('easy', 'medium', 'hard').required(),
  techStack: Joi.array().items(Joi.string().lowercase().min(1).max(60)).min(1).required(),
  supportedLanguages: Joi.array().items(Joi.string().valid('js', 'python', 'php')).min(1).required(),
  starterCode: Joi.object({
    js: Joi.string().allow('').max(20000).default(''),
    python: Joi.string().allow('').max(20000).default(''),
    php: Joi.string().allow('').max(20000).default(''),
  }).default({}),
  testCases: Joi.array().items(testCaseField).min(1).max(20).required(),
};

const createSchema = { body: Joi.object(baseFields) };

const updateSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    ...baseFields,
    title: baseFields.title.optional(),
    description: baseFields.description.optional(),
    difficulty: baseFields.difficulty.optional(),
    techStack: baseFields.techStack.optional(),
    supportedLanguages: baseFields.supportedLanguages.optional(),
    testCases: baseFields.testCases.optional(),
    isActive: Joi.boolean().optional(),
  }).min(1),
};

const idParamSchema = { params: Joi.object({ id: objectId.required() }) };

const listSchema = {
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    search: Joi.string().trim().max(120).empty('').optional(),
    difficulty: Joi.string().valid('easy', 'medium', 'hard').empty('').optional(),
    language: Joi.string().valid('js', 'python', 'php').empty('').optional(),
    source: Joi.string().valid('manual', 'ai').empty('').optional(),
    isActive: Joi.boolean().empty('').optional(),
  }),
};

const aiStarterCodeSchema = {
  body: Joi.object({
    description: Joi.string().min(10).max(10000).required(),
    language: Joi.string().valid('js', 'python', 'php').required(),
  }),
};

const aiFullProblemSchema = {
  body: Joi.object({
    topic: Joi.string().min(2).max(200).required(),
    difficulty: Joi.string().valid('easy', 'medium', 'hard').required(),
    languages: Joi.array().items(Joi.string().valid('js', 'python', 'php')).min(1).required(),
  }),
};

module.exports = {
  createSchema, updateSchema, idParamSchema, listSchema,
  aiStarterCodeSchema, aiFullProblemSchema,
};
