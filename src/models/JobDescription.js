'use strict';

const mongoose = require('mongoose');

const jobDescriptionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    techStack: { type: String, required: true, lowercase: true, trim: true, index: true },
    experience: {
      type: String,
      enum: ['entry', 'mid', 'senior'],
      required: true,
      index: true,
    },
    jobRole: { type: String, required: true, maxlength: 2000 },
    responsibilities: { type: String, required: true, maxlength: 5000 },
    qualifications: { type: String, required: true, maxlength: 5000 },
    niceToHave: { type: String, default: '', maxlength: 3000 },
    minYears: { type: Number, min: 0, max: 50, default: null },
    maxYears: { type: Number, min: 0, max: 50, default: null },
    location: { type: String, default: '', maxlength: 200 },
    isActive: { type: Boolean, default: true, index: true },
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

// Partial unique: only one ACTIVE JD per (techStack, experience).
jobDescriptionSchema.index(
  { techStack: 1, experience: 1 },
  { unique: true, partialFilterExpression: { isActive: true } },
);

module.exports = mongoose.model('JobDescription', jobDescriptionSchema);
