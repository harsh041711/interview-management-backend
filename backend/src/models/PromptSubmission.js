'use strict';
const mongoose = require('mongoose');
const { PROMPT_SUBMISSION_STATUS, PROMPT_SUBMISSION_STATUS_LIST } = require('../utils/constants');

const breakdownRubricSchema = new mongoose.Schema(
  { criterion: String, score: { type: Number, min: 0, max: 5 }, notes: String },
  { _id: false },
);
const breakdownOutputSchema = new mongoose.Schema(
  { criterion: String, pass: Boolean, notes: String },
  { _id: false },
);

const promptSubmissionSchema = new mongoose.Schema(
  {
    candidate:        { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true, index: true },
    promptProblem:    { type: mongoose.Schema.Types.ObjectId, ref: 'PromptProblem', required: true },
    accessToken:      { type: String, required: true, unique: true, index: true },
    assignedAt:       { type: Date, required: true },
    expiresAt:        { type: Date, required: true },
    firstOpenedAt:    { type: Date, default: null },
    submittedAt:      { type: Date, default: null },
    candidatePrompt:  { type: String, default: '', maxlength: 8000 },
    previewRunsUsed:  { type: Number, default: 0, min: 0, max: 5 },
    lastPreviewOutput:{ type: String, default: null, maxlength: 4000 },
    lastPreviewAt:    { type: Date, default: null },
    status: {
      type: String,
      enum: PROMPT_SUBMISSION_STATUS_LIST,
      default: PROMPT_SUBMISSION_STATUS.ASSIGNED,
      index: true,
    },
    evaluation: {
      rubricScore:     { type: Number, min: 0, max: 50 },
      rubricBreakdown: { type: [breakdownRubricSchema], default: undefined },
      outputScore:     { type: Number, min: 0, max: 50 },
      outputBreakdown: { type: [breakdownOutputSchema], default: undefined },
      executionOutput: { type: String, maxlength: 4000 },
      totalScore:      { type: Number, min: 0, max: 100 },
      aiNotes:         { type: String, maxlength: 2000 },
      evaluatedAt:     Date,
      aiProviderUsed:  String,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform: (_d, ret) => { delete ret.__v; return ret; } },
  },
);

promptSubmissionSchema.index({ candidate: 1, createdAt: -1 });

module.exports = mongoose.model('PromptSubmission', promptSubmissionSchema);
