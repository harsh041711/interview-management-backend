'use strict';
const Joi = require('joi');

const objectId = Joi.string().hex().length(24);

const idParamSchema = { params: Joi.object({ id: objectId.required() }) };

const listSchema = {
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    status: Joi.string().valid('pending', 'approved', 'rejected').empty('').optional(),
  }),
};

const decideSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    decision: Joi.string().valid('approved', 'rejected').required(),
    note: Joi.string().max(2000).allow('', null).optional(),
  }),
};

module.exports = { idParamSchema, listSchema, decideSchema };
