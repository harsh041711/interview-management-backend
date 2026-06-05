'use strict';

const Joi = require('joi');
const { INTERVIEW_STATUS_LIST, INTERVIEW_ROUND_TYPES_LIST } = require('../utils/constants');

const objectId = Joi.string().hex().length(24);

const scheduleSchema = {
  body: Joi.object({
    candidateId: objectId.required(),
    interviewerId: objectId.required(),
    scheduledAt: Joi.date().iso().greater('now').required(),
    durationMinutes: Joi.number().integer().min(15).max(240).optional(),
    meetingUrl: Joi.string().uri({ scheme: ['http', 'https'] }).allow('', null).optional(),
    notes: Joi.string().max(1000).empty('').optional(),
    roundType: Joi.string().valid(...INTERVIEW_ROUND_TYPES_LIST).optional(),
  }),
};

const updateInterviewSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    scheduledAt: Joi.date().iso().greater('now').optional(),
    durationMinutes: Joi.number().integer().min(15).max(240).optional(),
    meetingUrl: Joi.string().uri({ scheme: ['http', 'https'] }).optional(),
    notes: Joi.string().max(1000).empty('').optional(),
  }).min(1),
};

const cancelSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    reason: Joi.string().max(500).empty('').optional(),
  }),
};

const completeSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    note: Joi.string().max(1000).empty('').optional(),
  }),
};

const rescheduleDecisionSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    decision: Joi.string().valid('approved', 'rejected').required(),
    note: Joi.string().max(500).empty('').optional(),
  }),
};

const rescheduleRequestSchema = {
  body: Joi.object({
    proposedAt: Joi.date().iso().greater('now').required(),
    proposedDurationMinutes: Joi.number().integer().min(15).max(240).optional(),
    reason: Joi.string().max(500).empty('').optional(),
  }),
};

const listInterviewsSchema = {
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    status: Joi.string().valid(...INTERVIEW_STATUS_LIST).empty('').optional(),
    candidateId: objectId.empty('').optional(),
    interviewerId: objectId.empty('').optional(),
    from: Joi.date().iso().optional(),
    to: Joi.date().iso().optional(),
  }),
};

const idParamSchema = {
  params: Joi.object({ id: objectId.required() }),
};

module.exports = {
  scheduleSchema,
  updateInterviewSchema,
  cancelSchema,
  completeSchema,
  rescheduleDecisionSchema,
  rescheduleRequestSchema,
  listInterviewsSchema,
  idParamSchema,
};
