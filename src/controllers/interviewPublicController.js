'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/ApiResponse');
const interviewService = require('../services/interviewService');
const rescheduleRequestRepository = require('../repositories/rescheduleRequestRepository');

const getDetails = asyncHandler(async (req, res) => {
  const interviewId = req.interview.id || req.interview._id;
  const latestPendingReschedule = await rescheduleRequestRepository.findPendingForInterview(interviewId);
  const presented = interviewService.presentInterview(req.interview, {
    viewerRole: req.viewerRole,
    latestPendingReschedule: latestPendingReschedule || null,
  });
  return ok(res, { interview: presented }, 'Interview details fetched');
});

const submitReschedule = asyncHandler(async (req, res) => {
  const rescheduleRequest = await interviewService.requestReschedule(
    req.interview,
    req.viewerRole,
    req.body,
  );
  return created(res, { rescheduleRequest }, 'Reschedule request submitted');
});

module.exports = { getDetails, submitReschedule };
