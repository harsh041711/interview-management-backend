'use strict';

const Joi = require('joi');
const { CHEAT_EVENT_TYPE_LIST } = require('../utils/constants');

const objectId = Joi.string().hex().length(24);

const answerItem = Joi.object({
  questionId: objectId.required(),
  answer: Joi.alternatives().try(
    Joi.string().allow('').max(20_000),
    Joi.array().items(Joi.string()).max(20),
  ).optional(),
});

const submitSchema = {
  body: Joi.object({
    answers: Joi.array().items(answerItem).min(1).required(),
  }),
};

const autoSubmitSchema = {
  body: Joi.object({
    reason: Joi.string().max(300).optional(),
    eventType: Joi.string().valid(...CHEAT_EVENT_TYPE_LIST).optional(),
    answers: Joi.array().items(answerItem).optional(),
  }),
};

module.exports = { submitSchema, autoSubmitSchema };
