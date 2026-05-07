'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { ok, created, noContent } = require('../utils/ApiResponse');
const candidateService = require('../services/candidateService');

const createCandidate = asyncHandler(async (req, res) => {
  const candidate = await candidateService.createCandidate(req.body, req.admin.id);
  return created(res, { candidate }, 'Candidate created');
});

const listCandidates = asyncHandler(async (req, res) => {
  const result = await candidateService.list(req.query);
  return ok(res, result, 'Candidates fetched');
});

const getCandidate = asyncHandler(async (req, res) => {
  const result = await candidateService.detail(req.params.id);
  return ok(res, result, 'Candidate fetched');
});

const regenerateToken = asyncHandler(async (req, res) => {
  const candidate = await candidateService.regenerateToken(req.params.id);
  return ok(res, { candidate }, 'Test token regenerated');
});

const resendInvite = asyncHandler(async (req, res) => {
  const result = await candidateService.resendInvite(req.params.id);
  return ok(res, result, 'Invitation email sent');
});

const deleteCandidate = asyncHandler(async (req, res) => {
  await candidateService.remove(req.params.id);
  return noContent(res);
});

const uploadResume = asyncHandler(async (req, res) => {
  const candidate = await candidateService.uploadResume(req.params.id, req.file);
  return ok(res, { candidate }, 'Resume uploaded');
});

const removeResume = asyncHandler(async (req, res) => {
  const candidate = await candidateService.removeResume(req.params.id);
  return ok(res, { candidate }, 'Resume removed');
});

const stats = asyncHandler(async (_req, res) => {
  const data = await candidateService.stats();
  return ok(res, data, 'Stats fetched');
});

const selectCandidate = asyncHandler(async (req, res) => {
  const candidate = await candidateService.select(req.params.id);
  return ok(res, { candidate }, 'Candidate selected');
});

const rejectCandidate = asyncHandler(async (req, res) => {
  const candidate = await candidateService.reject(req.params.id, req.body);
  return ok(res, { candidate }, 'Candidate rejected');
});

module.exports = {
  createCandidate,
  listCandidates,
  getCandidate,
  regenerateToken,
  resendInvite,
  deleteCandidate,
  uploadResume,
  removeResume,
  stats,
  selectCandidate,
  rejectCandidate,
};
