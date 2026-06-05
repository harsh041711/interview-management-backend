'use strict';
const express = require('express');
const validate = require('../middlewares/validator');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');
const { requireMyInterview } = require('../middlewares/myInterviewMiddleware');
const { aiLimiter } = require('../middlewares/rateLimiter');
const ctrl = require('../controllers/liveInterviewController');
const v = require('../validators/liveInterviewValidator');

const router = express.Router();
router.use(requireAuth, requireRole('interviewer'));

// Scoped under /me — interview-side endpoints use requireMyInterview for ownership.
router.post('/interviews/:id/live/start', aiLimiter, validate(v.interviewIdParam), requireMyInterview, ctrl.start);
router.get( '/interviews/:id/live',       validate(v.interviewIdParam), requireMyInterview, ctrl.getActive);
router.get( '/interviews/:id/copilot-notes', validate(v.interviewIdParam), requireMyInterview, ctrl.getLatest);

// Session-side endpoints — ownership enforced inside the service (interviewer field on session).
router.patch('/live-sessions/:id',     validate(v.updateBody),     ctrl.updateQuestions);
router.post( '/live-sessions/:id/end', aiLimiter, validate(v.sessionIdParam), ctrl.end);

router.post(
  '/ai/suggest-follow-ups',
  aiLimiter,
  validate(v.suggestFollowUpsBody),
  ctrl.suggestFollowUps,
);

module.exports = router;
