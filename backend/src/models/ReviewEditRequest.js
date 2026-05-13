'use strict';
const mongoose = require('mongoose');
const { REVIEW_EDIT_STATUS } = require('../utils/constants');

const reviewEditRequestSchema = new mongoose.Schema({
  review: { type: mongoose.Schema.Types.ObjectId, ref: 'Review', required: true, index: true },
  interviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'Interviewer', required: true },
  reason: { type: String, default: null, maxlength: 1000 },
  status: { type: String, enum: Object.values(REVIEW_EDIT_STATUS), default: REVIEW_EDIT_STATUS.PENDING, index: true },
  consumed: { type: Boolean, default: false },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  decidedAt: { type: Date, default: null },
  decisionNote: { type: String, default: null },
}, { timestamps: true });

reviewEditRequestSchema.index(
  { review: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: REVIEW_EDIT_STATUS.PENDING } },
);

reviewEditRequestSchema.set('toJSON', { transform: (_d, ret) => { delete ret.__v; return ret; } });

module.exports = mongoose.model('ReviewEditRequest', reviewEditRequestSchema);
