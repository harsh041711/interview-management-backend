'use strict';

const Joi = require('joi');

const objectId = Joi.string().hex().length(24);

const createInterviewerSchema = {
  body: Joi.object({
    name: Joi.string().min(2).max(120).required(),
    email: Joi.string().email().lowercase().required(),
    expertise: Joi.array().items(Joi.string().min(1).max(60)).max(10).optional(),
    notes: Joi.string().max(500).optional(),
  }),
};

const updateInterviewerSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    name: Joi.string().min(2).max(120).optional(),
    email: Joi.string().email().lowercase().optional(),
    expertise: Joi.array().items(Joi.string().min(1).max(60)).max(10).optional(),
    notes: Joi.string().max(500).optional(),
    isActive: Joi.boolean().optional(),
  }),
};

const idParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

const listInterviewersSchema = {
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    search: Joi.string().trim().max(120).empty('').optional(),
    isActive: Joi.boolean().optional(),
  }),
};

module.exports = {
  createInterviewerSchema,
  updateInterviewerSchema,
  idParamSchema,
  listInterviewersSchema,
};
