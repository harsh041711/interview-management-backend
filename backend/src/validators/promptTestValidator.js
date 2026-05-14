'use strict';
const Joi = require('joi');

const assignSchema = {
  params: Joi.object({ id: Joi.string().hex().length(24).required() }),
  body: Joi.object({ problemId: Joi.string().hex().length(24).required() }),
};
const generateSchema = {
  params: Joi.object({ id: Joi.string().hex().length(24).required() }),
  body: Joi.object({
    topicOverride: Joi.string().max(200),
    difficultyOverride: Joi.string().valid('easy', 'medium', 'hard'),
  }),
};
const saveGeneratedSchema = {
  params: Joi.object({ id: Joi.string().hex().length(24).required() }),
  body: Joi.object({
    draft: Joi.object({
      title: Joi.string().required(),
      description: Joi.string().required(),
      sampleInput: Joi.string().required(),
      expectedOutputCriteria: Joi.array().items(Joi.string()).min(1).required(),
      customRubricCriteria: Joi.array().items(Joi.string()).default([]),
      difficulty: Joi.string().valid('easy', 'medium', 'hard').default('medium'),
      tags: Joi.array().items(Joi.string()).default([]),
      durationMinutes: Joi.number().integer().min(5).max(120).default(20),
    }).required(),
  }),
};
const tokenParamSchema = { params: Joi.object({ token: Joi.string().required() }) };
const previewSchema = {
  params: Joi.object({ token: Joi.string().required() }),
  body: Joi.object({ prompt: Joi.string().min(1).max(8000).required() }),
};
const submitSchema = {
  params: Joi.object({ token: Joi.string().required() }),
  body: Joi.object({ prompt: Joi.string().min(1).max(8000).required() }),
};

module.exports = {
  assignSchema, generateSchema, saveGeneratedSchema,
  tokenParamSchema, previewSchema, submitSchema,
};
