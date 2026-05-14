'use strict';
const Joi = require('joi');
const { DIFFICULTY_LIST } = require('../utils/constants');

const objectId = Joi.string().hex().length(24);
const LANGUAGES = ['js', 'python', 'php'];

const interviewIdParam = { params: Joi.object({ id: objectId.required() }) };

const createSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    difficulty: Joi.string().valid(...DIFFICULTY_LIST).required(),
    language:   Joi.string().valid(...LANGUAGES).required(),
  }),
};

const cancelParamsSchema = {
  params: Joi.object({
    id:     objectId.required(),
    taskId: objectId.required(),
  }),
};

const tokenParamSchema = {
  params: Joi.object({ token: Joi.string().min(8).max(128).required() }),
};

const runSchema = {
  params: Joi.object({ token: Joi.string().min(8).max(128).required() }),
  body:   Joi.object({ code: Joi.string().allow('').max(50000).required() }),
};

const submitSchema = runSchema;

module.exports = {
  interviewIdParam,
  createSchema,
  cancelParamsSchema,
  tokenParamSchema,
  runSchema,
  submitSchema,
};
