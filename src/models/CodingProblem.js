'use strict';

const mongoose = require('mongoose');

const testCaseSchema = new mongoose.Schema(
  {
    stdin: { type: String, default: '' },
    expectedStdout: { type: String, default: '' },
    isHidden: { type: Boolean, default: true },
  },
  { _id: false },
);

const codingProblemSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true, maxlength: 10000 },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium', index: true },
    techStack: {
      type: [String],
      required: true,
      validate: { validator: (a) => Array.isArray(a) && a.length > 0, message: 'At least one tech stack required' },
    },
    supportedLanguages: {
      type: [String],
      enum: ['js', 'python', 'php'],
      required: true,
      validate: { validator: (a) => Array.isArray(a) && a.length > 0, message: 'At least one supported language required' },
    },
    starterCode: {
      js: { type: String, default: '' },
      python: { type: String, default: '' },
      php: { type: String, default: '' },
    },
    testCases: { type: [testCaseSchema], default: [] },
    source: { type: String, enum: ['manual', 'ai'], default: 'manual', index: true },
    isActive: { type: Boolean, default: true, index: true },
    timesUsed: { type: Number, default: 0, min: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
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

codingProblemSchema.index({ techStack: 1, difficulty: 1, isActive: 1 });
codingProblemSchema.index({ source: 1, isActive: 1, updatedAt: -1 });

module.exports = mongoose.model('CodingProblem', codingProblemSchema);
