'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { verifyTestToken } = require('../utils/tokenGenerator');
const candidateRepository = require('../repositories/candidateRepository');
const { CANDIDATE_STATUS } = require('../utils/constants');

const extractTestToken = (req) =>
  req.headers['x-test-token'] ||
  req.query.token ||
  req.body?.token ||
  null;

const requireCandidateToken = asyncHandler(async (req, _res, next) => {
  const token = extractTestToken(req);
  if (!token) throw ApiError.unauthorized('Test token required', { code: 'E_TEST_TOKEN_MISSING' });

  if (!verifyTestToken(token)) {
    throw ApiError.unauthorized('Invalid test token', { code: 'E_TEST_TOKEN_INVALID' });
  }

  const candidate = await candidateRepository.findByTestToken(token);
  if (!candidate) throw ApiError.unauthorized('Test token not recognized', { code: 'E_TEST_TOKEN_UNKNOWN' });

  if (candidate.tokenExpiresAt && candidate.tokenExpiresAt.getTime() < Date.now()) {
    if (candidate.status !== CANDIDATE_STATUS.EXPIRED) {
      candidate.status = CANDIDATE_STATUS.EXPIRED;
      await candidate.save();
    }
    throw ApiError.unauthorized('Test link has expired', { code: 'E_TEST_TOKEN_EXPIRED' });
  }

  if ([CANDIDATE_STATUS.COMPLETED, CANDIDATE_STATUS.CHEATED, CANDIDATE_STATUS.EXPIRED, CANDIDATE_STATUS.SHORTLISTED, CANDIDATE_STATUS.REJECTED].includes(candidate.status)) {
    throw ApiError.forbidden(`Test session already ${candidate.status}`, { code: 'E_TEST_TOKEN_LOCKED' });
  }

  req.candidate = candidate;
  next();
});

module.exports = { requireCandidateToken, extractTestToken };
