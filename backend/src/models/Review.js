'use strict';
const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  interview: { type: mongoose.Schema.Types.ObjectId, ref: 'Interview', required: true, unique: true },
  interviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'Interviewer', required: true, index: true },
  candidate: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true, index: true },
  ratings: {
    knowledge: { type: Number, required: true, min: 1, max: 5 },
    communication: { type: Number, required: true, min: 1, max: 5 },
    confidence: { type: Number, required: true, min: 1, max: 5 },
  },
  comments: { type: String, required: true, minlength: 10, maxlength: 2000, trim: true },
  submittedAt: { type: Date, default: Date.now },
  lastEditedAt: { type: Date, default: null },
  editCount: { type: Number, default: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Interviewer', required: true },
}, { timestamps: true });

reviewSchema.virtual('averageRating').get(function () {
  const r = this.ratings;
  return Math.round(((r.knowledge + r.communication + r.confidence) / 3) * 10) / 10;
});

reviewSchema.set('toJSON', { virtuals: true, transform: (_d, ret) => { delete ret.__v; return ret; } });

module.exports = mongoose.model('Review', reviewSchema);
