'use strict';
const Joi = require('joi');

const objectId = Joi.string().hex().length(24);

const interviewIdParam = { params: Joi.object({ id: objectId.required() }) };
const sessionIdParam   = { params: Joi.object({ id: objectId.required() }) };

const updateBody = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    questionUpdates: Joi.array().items(
      Joi.object({
        index:   Joi.number().integer().min(0).required(),
        askedAt: Joi.date().allow(null).optional(),
        note:    Joi.string().allow('').max(500).optional(),
        rating:  Joi.number().integer().min(1).max(5).allow(null).optional(),
      }),
    ).min(1).max(20).required(),
  }),
};

const suggestFollowUpsBody = {
  body: Joi.object({
    questionText: Joi.string().min(1).max(2000).required(),
    note:         Joi.string().min(1).max(2000).required(),
    topic:        Joi.string().allow('').max(200).optional(),
    difficulty:   Joi.string().valid('easy', 'medium', 'hard').optional(),
  }),
};

module.exports = { interviewIdParam, sessionIdParam, updateBody, suggestFollowUpsBody };
