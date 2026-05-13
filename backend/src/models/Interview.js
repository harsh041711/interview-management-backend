'use strict';

const mongoose = require('mongoose');
const { INTERVIEW_STATUS, INTERVIEW_STATUS_LIST } = require('../utils/constants');

const interviewSchema = new mongoose.Schema(
  {
    candidate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Candidate',
      required: true,
      index: true,
    },
    interviewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Interviewer',
      required: true,
      index: true,
    },
    scheduledAt: { type: Date, required: true, index: true },
    durationMinutes: { type: Number, default: 45, min: 15, max: 240 },
    meetingUrl: { type: String, required: true },
    notes: { type: String, maxlength: 1000 },
    candidateAccessToken: { type: String, required: true, unique: true, index: true },
    interviewerAccessToken: { type: String, required: true, unique: true, index: true },
    status: {
      type: String,
      enum: INTERVIEW_STATUS_LIST,
      default: INTERVIEW_STATUS.SCHEDULED,
      index: true,
    },
    scheduledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: true,
    },
    completedAt: { type: Date, default: null },
    completionNote: { type: String, default: null },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, default: null },
    reminderSentAt: { type: Date, default: null },
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

interviewSchema.index({ candidate: 1, scheduledAt: -1 });
interviewSchema.index({ interviewer: 1, scheduledAt: -1 });
interviewSchema.index({ status: 1, scheduledAt: -1 });

module.exports = mongoose.model('Interview', interviewSchema);
