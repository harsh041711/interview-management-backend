'use strict';

const mongoose = require('mongoose');
const { DIFFICULTY_LIST, LIVE_CODING_TASK_STATUS, LIVE_CODING_TASK_STATUS_LIST } = require('../utils/constants');

const LANGUAGES = ['js', 'python', 'php'];

const testCaseSchema = new mongoose.Schema(
  {
    stdin:          { type: String, default: '' },
    expectedStdout: { type: String, default: '' },
    isHidden:       { type: Boolean, default: true },
  },
  { _id: false },
);

const problemSchema = new mongoose.Schema(
  {
    title:       { type: String, required: true, maxlength: 200 },
    description: { type: String, required: true, maxlength: 10000 },
    difficulty:  { type: String, enum: DIFFICULTY_LIST, required: true },
    language:    { type: String, enum: LANGUAGES, required: true },
    starterCode: { type: String, default: '' },
    testCases:   { type: [testCaseSchema], default: [] },
  },
  { _id: false },
);

const runResultSchema = new mongoose.Schema(
  {
    stdin:          { type: String, default: '' },
    expectedStdout: { type: String, default: '' },
    actualStdout:   { type: String, default: '' },
    stderr:         { type: String, default: '' },
    passed:         { type: Boolean, default: false },
    runtimeMs:      { type: Number, default: 0 },
    error:          { type: String, default: null },
  },
  { _id: false },
);

const submissionSchema = new mongoose.Schema(
  {
    code:        { type: String, required: true },
    submittedAt: { type: Date, required: true },
    results:     { type: [runResultSchema], default: [] },
    summary: {
      passed: { type: Number, default: 0 },
      total:  { type: Number, default: 0 },
    },
  },
  { _id: false },
);

const taskSchema = new mongoose.Schema(
  {
    interview:    { type: mongoose.Schema.Types.ObjectId, ref: 'Interview', required: true, index: true },
    candidate:    { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true },
    interviewer:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    liveSession:  { type: mongoose.Schema.Types.ObjectId, ref: 'LiveSession', default: null },

    token:        { type: String, required: true, unique: true, index: true },

    problem:      { type: problemSchema, required: true },
    submission:   { type: submissionSchema, default: null },

    status: {
      type: String,
      enum: LIVE_CODING_TASK_STATUS_LIST,
      default: LIVE_CODING_TASK_STATUS.PENDING,
      index: true,
    },
    openedAt:    { type: Date, default: null },
    submittedAt: { type: Date, default: null },
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

taskSchema.index({ interview: 1, createdAt: -1 });

module.exports = mongoose.model('LiveCodingTask', taskSchema);
