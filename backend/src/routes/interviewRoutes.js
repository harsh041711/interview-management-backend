'use strict';

const express = require('express');
const validate = require('../middlewares/validator');
const { requireAuth } = require('../middlewares/authMiddleware');
const interviewController = require('../controllers/interviewController');
const {
  scheduleSchema,
  listInterviewsSchema,
  idParamSchema,
  updateInterviewSchema,
  cancelSchema,
  completeSchema,
  rescheduleDecisionSchema,
} = require('../validators/interviewValidator');

const router = express.Router();

router.use(requireAuth);

router.post('/', validate(scheduleSchema), interviewController.scheduleInterview);
router.get('/', validate(listInterviewsSchema), interviewController.listInterviews);
router.get('/:id', validate(idParamSchema), interviewController.getInterview);
router.put('/:id', validate(updateInterviewSchema), interviewController.updateInterview);
router.post('/:id/cancel', validate(cancelSchema), interviewController.cancelInterview);
router.post('/:id/complete', validate(completeSchema), interviewController.completeInterview);
router.post('/:id/reschedule-decision', validate(rescheduleDecisionSchema), interviewController.decideReschedule);

module.exports = router;
