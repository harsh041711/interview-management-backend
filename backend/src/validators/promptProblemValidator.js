'use strict';
const Joi = require('joi');

const baseProblemFields = {
  title:                  Joi.string().min(3).max(200).required(),
  description:            Joi.string().min(10).max(4000).required(),
  sampleInput:            Joi.string().min(1).max(4000).required(),
  expectedOutputCriteria: Joi.array().items(Joi.string().max(300)).min(1).max(10).required(),
  customRubricCriteria:   Joi.array().items(Joi.string().max(200)).max(5).default([]),
  difficulty:             Joi.string().valid('easy', 'medium', 'hard').default('medium'),
  tags:                   Joi.array().items(Joi.string()).default([]),
  durationMinutes:        Joi.number().integer().min(5).max(120).default(20),
};

const createSchema = { body: Joi.object(baseProblemFields) };
const updateSchema = {
  params: Joi.object({ id: Joi.string().hex().length(24).required() }),
  body: Joi.object({
    ...Object.fromEntries(Object.entries(baseProblemFields).map(([k, v]) => [k, v.optional()])),
  }).min(1),
};
const listSchema = {
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    difficulty: Joi.string().valid('easy', 'medium', 'hard'),
    q: Joi.string().max(200),
  }),
};
const idParamSchema = { params: Joi.object({ id: Joi.string().hex().length(24).required() }) };

module.exports = { createSchema, updateSchema, listSchema, idParamSchema };
