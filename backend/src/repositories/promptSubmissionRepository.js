'use strict';
const PromptSubmission = require('../models/PromptSubmission');

const create = (data) => PromptSubmission.create(data);
const findById = (id) => PromptSubmission.findById(id).populate('promptProblem');
const findByToken = (token) => PromptSubmission.findOne({ accessToken: token }).populate('promptProblem');
const findByCandidate = (candidateId) =>
  PromptSubmission.findOne({ candidate: candidateId }).sort({ createdAt: -1 }).populate('promptProblem');
const updateById = (id, patch) => PromptSubmission.findByIdAndUpdate(id, patch, { new: true });
const incrementPreviewRuns = (id, output) =>
  PromptSubmission.findByIdAndUpdate(
    id,
    { $inc: { previewRunsUsed: 1 }, $set: { lastPreviewOutput: output, lastPreviewAt: new Date() } },
    { new: true },
  );

module.exports = { create, findById, findByToken, findByCandidate, updateById, incrementPreviewRuns };
