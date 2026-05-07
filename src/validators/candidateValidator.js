'use strict';

const Joi = require('joi');
const { CANDIDATE_STATUS_LIST } = require('../utils/constants');

const objectId = Joi.string().hex().length(24);

const createCandidateSchema = {
  body: Joi.object({
    name: Joi.string().min(2).max(120).required(),
    email: Joi.string().email().lowercase().required(),
    techStack: Joi.array().items(Joi.string().min(1).max(60)).min(1).max(10).required(),
    questionCount: Joi.number().integer().min(1).max(50).optional(),
    durationMinutes: Joi.number().integer().min(1).max(240).optional(),
  }),
};

const idParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

const listCandidatesSchema = {
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    status: Joi.string().valid(...CANDIDATE_STATUS_LIST).empty('').optional(),
    search: Joi.string().trim().max(120).empty('').optional(),
    techStack: Joi.string().trim().max(60).empty('').optional(),
  }),
};

module.exports = { createCandidateSchema, idParamSchema, listCandidatesSchema };
