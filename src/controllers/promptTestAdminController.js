'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/ApiResponse');
const svc = require('../services/promptTestService');

const assign = asyncHandler(async (req, res) => {
  const result = await svc.assign({
    candidateId: req.params.id,
    problemId: req.body.problemId,
    adminId: req.admin.id,
  });
  return created(res, result, 'Prompt test assigned');
});

const generate = asyncHandler(async (req, res) => {
  const result = await svc.generateAndAssign({
    candidateId: req.params.id,
    topicOverride: req.body.topicOverride,
    difficultyOverride: req.body.difficultyOverride,
    adminId: req.admin.id,
  });
  return ok(res, result, 'Draft generated');
});

const saveGenerated = asyncHandler(async (req, res) => {
  const result = await svc.saveGeneratedAndAssign({
    candidateId: req.params.id,
    draft: req.body.draft,
    adminId: req.admin.id,
  });
  return created(res, result, 'Saved and assigned');
});

const getSubmission = asyncHandler(async (req, res) => {
  const submission = await svc.getSubmissionForCandidate(req.params.id);
  return ok(res, { submission }, 'OK');
});

const reevaluate = asyncHandler(async (req, res) => {
  const submission = await svc.getSubmissionForCandidate(req.params.id);
  if (!submission) return ok(res, {}, 'No submission');
  await svc.reevaluate(submission.id || submission._id);
  return ok(res, { queued: true }, 'Re-evaluation queued');
});

module.exports = { assign, generate, saveGenerated, getSubmission, reevaluate };
