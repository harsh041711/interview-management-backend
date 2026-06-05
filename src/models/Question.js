'use strict';

const mongoose = require('mongoose');
const {
  QUESTION_TYPES,
  QUESTION_TYPE_LIST,
  DIFFICULTY,
  DIFFICULTY_LIST,
  QUESTION_SOURCE,
} = require('../utils/constants');

const questionSchema = new mongoose.Schema(
  {
    techStack: { type: String, required: true, trim: true, index: true },
    type: { type: String, enum: QUESTION_TYPE_LIST, required: true, index: true },
    question: { type: String, required: true, trim: true, maxlength: 2000 },
    options: {
      type: [String],
      validate: {
        validator(value) {
          if (this.type === QUESTION_TYPES.MCQ || this.type === QUESTION_TYPES.MULTI_SELECT) {
            return Array.isArray(value) && value.length >= 2 && value.length <= 8;
          }
          return value === undefined || value === null || (Array.isArray(value) && value.length === 0);
        },
        message: 'MCQ/Multi-select require 2-8 options',
      },
      default: undefined,
    },
    correctAnswer: {
      type: mongoose.Schema.Types.Mixed,
      validate: {
        validator(value) {
          switch (this.type) {
            case QUESTION_TYPES.MCQ:
            case QUESTION_TYPES.ONE_LINE:
              return typeof value === 'string' && value.trim().length > 0;
            case QUESTION_TYPES.MULTI_SELECT:
              return Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'string');
            case QUESTION_TYPES.DESCRIPTIVE:
              return value === undefined || value === null || typeof value === 'string';
            default:
              return false;
          }
        },
        message: 'correctAnswer shape mismatched for question type',
      },
    },
    keywords: { type: [String], default: [] },
    marks: { type: Number, default: 1, min: 0.25, max: 50 },
    difficulty: { type: String, enum: DIFFICULTY_LIST, default: DIFFICULTY.MEDIUM },
    source: { type: String, enum: Object.values(QUESTION_SOURCE), default: QUESTION_SOURCE.MANUAL },
    rubric: { type: String, trim: true, maxlength: 2000 }, // descriptive grading guidance
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    isActive: { type: Boolean, default: true, index: true },
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

questionSchema.index({ techStack: 1, type: 1, difficulty: 1, isActive: 1 });

module.exports = mongoose.model('Question', questionSchema);
