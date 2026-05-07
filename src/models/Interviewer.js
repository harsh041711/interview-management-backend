'use strict';

const mongoose = require('mongoose');

const interviewerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    expertise: { type: [String], default: [] },
    isActive: { type: Boolean, default: true, index: true },
    notes: { type: String, maxlength: 500 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    passwordHash: { type: String, default: null, select: false },
    passwordSetAt: { type: Date, default: null },
    setupTokenHash: { type: String, default: null, index: true },
    setupTokenExpiresAt: { type: Date, default: null },
    setupTokenPurpose: {
      type: String,
      enum: ['initial_setup', 'forgot_password', null],
      default: null,
    },
    lastLoginAt: { type: Date, default: null },
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

interviewerSchema.index({ isActive: 1, createdAt: -1 });

interviewerSchema.methods.comparePassword = async function (plain) {
  if (!this.passwordHash) return false;
  const bcryptjs = require('bcryptjs');
  return bcryptjs.compare(plain, this.passwordHash);
};

module.exports = mongoose.model('Interviewer', interviewerSchema);
