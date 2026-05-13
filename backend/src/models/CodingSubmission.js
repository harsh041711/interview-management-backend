'use strict';

const mongoose = require('mongoose');

const runSchema = new mongoose.Schema(
  {
    stdin: { type: String, default: '' },
    expectedStdout: { type: String, default: '' },
    actualStdout: { type: String, default: '' },
    stderr: { type: String, default: '' },
    exitCode: { type: Number, default: null },
    runtimeMs: { type: Number, default: null },
    passed: { type: Boolean, default: false },
    error: { type: String, default: null },
  },
  { _id: false },
);

const codingSubmissionSchema = new mongoose.Schema(
  {
    candidate: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true, index: true },
    codingTestToken: { type: String, required: true, index: true },
    problem: { type: mongoose.Schema.Types.ObjectId, ref: 'CodingProblem', required: true },
    language: { type: String, enum: ['js', 'python', 'php'], required: true },
    code: { type: String, required: true, maxlength: 50000 },

    runs: { type: [runSchema], default: [] },
    passedCount: { type: Number, default: 0 },
    totalCount: { type: Number, default: 0 },

    rating: { type: Number, default: null, min: 1, max: 5 },
    reviewComment: { type: String, default: '', maxlength: 2000 },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    reviewedAt: { type: Date, default: null },

    tabSwitches: { type: Number, default: 0, min: 0 },
    submittedAt: { type: Date, required: true },
    autoSubmitted: { type: Boolean, default: false },
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

codingSubmissionSchema.index({ candidate: 1, problem: 1 }, { unique: true });

module.exports = mongoose.model('CodingSubmission', codingSubmissionSchema);
