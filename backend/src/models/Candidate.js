'use strict';

const mongoose = require('mongoose');
const { CANDIDATE_STATUS, CANDIDATE_STATUS_LIST } = require('../utils/constants');

const candidateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    techStack: {
      type: [String],
      required: true,
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: 'At least one tech stack required',
      },
    },
    testToken: { type: String, required: true, unique: true, index: true },
    tokenExpiresAt: { type: Date, required: true, index: true },
    questionCount: { type: Number, default: 10, min: 1, max: 50 },
    durationMinutes: { type: Number, default: 12, min: 1, max: 240 },
    status: {
      type: String,
      enum: CANDIDATE_STATUS_LIST,
      default: CANDIDATE_STATUS.PENDING,
      index: true,
    },
    photoUrl: { type: String, default: null },
    photoPublicId: { type: String, default: null },
    photoCapturedAt: { type: Date, default: null },
    resumeUrl: { type: String, default: null },
    resumePublicId: { type: String, default: null },
    resumeOriginalName: { type: String, default: null },
    resumeMimeType: { type: String, default: null },
    resumeBytes: { type: Number, default: null },
    resumeUploadedAt: { type: Date, default: null },
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

candidateSchema.index({ email: 1, createdAt: -1 });
candidateSchema.index({ status: 1, createdAt: -1 });

candidateSchema.virtual('isExpired').get(function () {
  return this.tokenExpiresAt && this.tokenExpiresAt.getTime() < Date.now();
});

module.exports = mongoose.model('Candidate', candidateSchema);
