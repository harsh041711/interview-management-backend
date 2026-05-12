'use strict';

const Joi = require('joi');

const objectId = Joi.string().hex().length(24);

const submitSchema = {
  params: Joi.object({ token: Joi.string().required() }),
  body: Joi.object({
    submissions: Joi.array().items(Joi.object({
      problemId: objectId.required(),
      language: Joi.string().valid('js', 'python', 'php').required(),
      code: Joi.string().allow('').max(50000).required(),
    })).min(1).required(),
    tabSwitches: Joi.number().integer().min(0).default(0),
    autoSubmitted: Joi.boolean().default(false),
  }),
};

const tokenParamSchema = {
  params: Joi.object({ token: Joi.string().required() }),
};

const idParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

const rateSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    rating: Joi.number().integer().min(1).max(5).required(),
    reviewComment: Joi.string().allow('').max(2000).default(''),
  }),
};

module.exports = { submitSchema, tokenParamSchema, idParamSchema, rateSchema };
