'use strict';

const mongoose = require('mongoose');
const { QUESTION_TYPE_LIST, AI_PROVIDERS } = require('../utils/constants');

const answerSchema = new mongoose.Schema(
  {
    question: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
    type: { type: String, enum: QUESTION_TYPE_LIST, required: true },
    given: { type: mongoose.Schema.Types.Mixed },
    isCorrect: { type: Boolean, default: false },
    score: { type: Number, default: 0 },
    maxScore: { type: Number, default: 0 },
    aiFeedback: { type: String },
    aiProvider: { type: String, enum: [...Object.values(AI_PROVIDERS), null], default: null },
  },
  { _id: false },
);

const submissionSchema = new mongoose.Schema(
  {
    candidate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Candidate',
      required: true,
      unique: true,
      index: true,
    },
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'TestSession', required: true, index: true },
    answers: { type: [answerSchema], default: [] },
    totalScore: { type: Number, default: 0 },
    maxScore: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    autoSubmitted: { type: Boolean, default: false },
    cheatDetected: { type: Boolean, default: false },
    cheatReason: { type: String },
    submittedAt: { type: Date, default: Date.now },
    reportEmailedAt: { type: Date },
    reportEmailError: { type: String },
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

submissionSchema.index({ submittedAt: -1 });

module.exports = mongoose.model('Submission', submissionSchema);
