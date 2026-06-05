'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { verifyInterviewToken } = require('../utils/interviewToken');
const interviewRepository = require('../repositories/interviewRepository');
const { INTERVIEW_STATUS } = require('../utils/constants');

const requireInterviewToken = asyncHandler(async (req, _res, next) => {
  const token =
    req.headers['x-interview-token'] ||
    req.query.token ||
    null;

  if (!token) {
    throw ApiError.unauthorized('Interview token required', { code: 'E_INTERVIEW_TOKEN_INVALID' });
  }

  if (!verifyInterviewToken(token)) {
    throw ApiError.unauthorized('Invalid interview token', { code: 'E_INTERVIEW_TOKEN_INVALID' });
  }

  let interview = await interviewRepository.findByCandidateAccessToken(token);
  let viewerRole = 'candidate';

  if (!interview) {
    interview = await interviewRepository.findByInterviewerAccessToken(token);
    viewerRole = 'interviewer';
  }

  if (!interview) {
    throw ApiError.unauthorized('Interview token not recognized', { code: 'E_INTERVIEW_TOKEN_UNKNOWN' });
  }

  if (
    interview.status === INTERVIEW_STATUS.COMPLETED ||
    interview.status === INTERVIEW_STATUS.CANCELLED
  ) {
    throw new ApiError(410, `Interview is ${interview.status}`, { code: 'E_INTERVIEW_LOCKED' });
  }

  req.interview = interview;
  req.viewerRole = viewerRole;
  next();
});

module.exports = { requireInterviewToken };
