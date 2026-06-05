'use strict';
const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema(
  {
    text:       { type: String, required: true, maxlength: 600 },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], required: true },
    topic:      { type: String, maxlength: 80, default: '' },
    askedAt:    { type: Date, default: null },
    note:       { type: String, maxlength: 500, default: '' },
    rating:     { type: Number, min: 1, max: 5, default: null },
  },
  { _id: false },
);

const draftReviewSchema = new mongoose.Schema(
  {
    knowledge:      { type: Number, min: 1, max: 5, default: null },
    communication:  { type: Number, min: 1, max: 5, default: null },
    confidence:     { type: Number, min: 1, max: 5, default: null },
    comments:       { type: String, maxlength: 4000, default: '' },
    recommendation: { type: String, enum: ['hire', 'no_hire', 'next_round', null], default: null },
    generatedBy:    { type: String, default: '' },
  },
  { _id: false },
);

const liveSessionSchema = new mongoose.Schema(
  {
    interview:    { type: mongoose.Schema.Types.ObjectId, ref: 'Interview', required: true, index: true },
    interviewer:  { type: mongoose.Schema.Types.ObjectId, ref: 'Interviewer', required: true, index: true },
    candidate:    { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true },
    startedAt:    { type: Date, required: true, default: Date.now },
    endedAt:      { type: Date, default: null },
    questions:    { type: [questionSchema], default: [] },
    draftReview:  { type: draftReviewSchema, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform: (_d, ret) => { delete ret.__v; return ret; } },
  },
);

liveSessionSchema.index({ interview: 1, endedAt: 1 });
liveSessionSchema.index({ interviewer: 1, createdAt: -1 });

module.exports = mongoose.model('LiveSession', liveSessionSchema);
