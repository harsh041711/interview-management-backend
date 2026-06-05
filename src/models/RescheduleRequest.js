'use strict';

const mongoose = require('mongoose');
const { RESCHEDULE_STATUS, RESCHEDULE_STATUS_LIST } = require('../utils/constants');

const rescheduleRequestSchema = new mongoose.Schema(
  {
    interview: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Interview',
      required: true,
      index: true,
    },
    proposedAt: { type: Date, required: true },
    proposedDurationMinutes: { type: Number, min: 15, max: 240 },
    reason: { type: String, maxlength: 500 },
    status: {
      type: String,
      enum: RESCHEDULE_STATUS_LIST,
      default: RESCHEDULE_STATUS.PENDING,
      index: true,
    },
    decidedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
    },
    decidedAt: { type: Date, default: null },
    decisionNote: { type: String, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  },
);

module.exports = mongoose.model('RescheduleRequest', rescheduleRequestSchema);
