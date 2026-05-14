'use strict';
const mongoose = require('mongoose');
const { PROMPT_PROBLEM_SOURCE_LIST } = require('../utils/constants');

const promptProblemSchema = new mongoose.Schema(
  {
    title:                  { type: String, required: true, maxlength: 200, trim: true },
    description:            { type: String, required: true, maxlength: 4000 },
    sampleInput:            { type: String, required: true, maxlength: 4000 },
    expectedOutputCriteria: {
      type: [{ type: String, maxlength: 300 }],
      validate: (v) => Array.isArray(v) && v.length >= 1 && v.length <= 10,
    },
    customRubricCriteria: {
      type: [{ type: String, maxlength: 200 }],
      default: [],
      validate: (v) => Array.isArray(v) && v.length <= 5,
    },
    difficulty:      { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium', index: true },
    tags:            { type: [String], default: [] },
    durationMinutes: { type: Number, default: 20, min: 5, max: 120 },
    source:          { type: String, enum: PROMPT_PROBLEM_SOURCE_LIST, required: true },
    createdFor:      { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', default: null, index: true },
    createdBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform: (_d, ret) => { delete ret.__v; return ret; } },
  },
);

promptProblemSchema.index({ createdAt: -1 });

module.exports = mongoose.model('PromptProblem', promptProblemSchema);
