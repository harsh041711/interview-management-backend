'use strict';
const Joi = require('joi');

const ratingNum = Joi.number().integer().min(1).max(5);

const reviewSubmitSchema = {
  body: Joi.object({
    ratings: Joi.object({
      knowledge: ratingNum.required(),
      communication: ratingNum.required(),
      confidence: ratingNum.required(),
    }).required(),
    comments: Joi.string().min(10).max(2000).trim().required(),
  }),
};

const reviewEditSchema = {
  params: Joi.object({ reviewId: Joi.string().hex().length(24).required() }),
  body: Joi.object({
    ratings: Joi.object({
      knowledge: ratingNum.required(),
      communication: ratingNum.required(),
      confidence: ratingNum.required(),
    }).required(),
    comments: Joi.string().min(10).max(2000).trim().required(),
  }),
};

const editRequestSchema = {
  params: Joi.object({ reviewId: Joi.string().hex().length(24).required() }),
  body: Joi.object({
    reason: Joi.string().max(1000).allow('', null).optional(),
  }),
};

module.exports = { reviewSubmitSchema, reviewEditSchema, editRequestSchema };
