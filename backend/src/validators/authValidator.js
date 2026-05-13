'use strict';

const Joi = require('joi');

const passwordSchema = Joi.string().min(8).max(128).required();

const registerSchema = {
  body: Joi.object({
    name: Joi.string().min(2).max(120).required(),
    email: Joi.string().email().lowercase().required(),
    password: passwordSchema,
    hrNotificationEmail: Joi.string().email().lowercase().optional(),
  }),
};

const loginSchema = {
  body: Joi.object({
    email: Joi.string().email().lowercase().required(),
    password: Joi.string().min(1).max(128).required(),
  }),
};

const forgotPasswordSchema = {
  body: Joi.object({
    email: Joi.string().email().lowercase().required(),
  }),
};

const accountSetupSchema = {
  body: Joi.object({
    token: Joi.string().required(),
    password: Joi.string().min(8).max(200).required(),
  }),
};

const accountSetupTokenParamSchema = {
  params: Joi.object({ token: Joi.string().required() }),
};

module.exports = { registerSchema, loginSchema, forgotPasswordSchema, accountSetupSchema, accountSetupTokenParamSchema };
