'use strict';

const mongoose = require('mongoose');
const {
  SESSION_STATUS,
  SESSION_STATUS_LIST,
  CHEAT_EVENT_TYPE_LIST,
} = require('../utils/constants');

const cheatEventSchema = new mongoose.Schema(
  {
    type: { type: String, enum: CHEAT_EVENT_TYPE_LIST, required: true },
    at: { type: Date, default: Date.now },
    meta: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false },
);

const sessionSchema = new mongoose.Schema(
  {
    candidate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Candidate',
      required: true,
      unique: true,
      index: true,
    },
    questions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question' }],
    startedAt: { type: Date, default: Date.now },
    endsAt: { type: Date, required: true },
    submittedAt: { type: Date },
    status: {
      type: String,
      enum: SESSION_STATUS_LIST,
      default: SESSION_STATUS.ACTIVE,
      index: true,
    },
    cheatEvents: { type: [cheatEventSchema], default: [] },
    ipAddress: { type: String },
    userAgent: { type: String },
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

module.exports = mongoose.model('TestSession', sessionSchema);
