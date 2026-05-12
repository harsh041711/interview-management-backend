'use strict';

const Joi = require('joi');

const objectId = Joi.string().hex().length(24);

const baseFields = {
  title: Joi.string().min(2).max(200).required(),
  techStack: Joi.string().lowercase().min(1).max(60).required(),
  experience: Joi.string().valid('entry', 'mid', 'senior').required(),
  jobRole: Joi.string().min(10).max(2000).required(),
  responsibilities: Joi.string().min(10).max(5000).required(),
  qualifications: Joi.string().min(10).max(5000).required(),
  niceToHave: Joi.string().allow('').max(3000).optional(),
  minYears: Joi.number().integer().min(0).max(50).allow(null).optional(),
  maxYears: Joi.number().integer().min(0).max(50).allow(null).optional(),
  location: Joi.string().allow('').max(200).optional(),
};

const createJdSchema = { body: Joi.object(baseFields) };

const updateJdSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    ...baseFields,
    title: baseFields.title.optional(),
    techStack: baseFields.techStack.optional(),
    experience: baseFields.experience.optional(),
    jobRole: baseFields.jobRole.optional(),
    responsibilities: baseFields.responsibilities.optional(),
    qualifications: baseFields.qualifications.optional(),
    isActive: Joi.boolean().optional(),
  }).min(1),
};

const idParamSchema = { params: Joi.object({ id: objectId.required() }) };

const listJdsSchema = {
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    search: Joi.string().trim().max(120).empty('').optional(),
    experience: Joi.string().valid('entry', 'mid', 'senior').empty('').optional(),
    isActive: Joi.boolean().empty('').optional(),
  }),
};

const lookupJdSchema = {
  query: Joi.object({
    techStack: Joi.string().lowercase().min(1).max(60).required(),
    experience: Joi.string().valid('entry', 'mid', 'senior').required(),
  }),
};

module.exports = {
  createJdSchema,
  updateJdSchema,
  idParamSchema,
  listJdsSchema,
  lookupJdSchema,
};
