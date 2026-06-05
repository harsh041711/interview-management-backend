'use strict';

const express = require('express');
const validate = require('../middlewares/validator');
const { requireInterviewToken } = require('../middlewares/interviewMiddleware');
const { rescheduleLimiter } = require('../middlewares/rateLimiter');
const interviewPublicController = require('../controllers/interviewPublicController');
const { rescheduleRequestSchema } = require('../validators/interviewValidator');

const router = express.Router();

router.use(requireInterviewToken);

router.get('/details', interviewPublicController.getDetails);
router.post('/reschedule', rescheduleLimiter, validate(rescheduleRequestSchema), interviewPublicController.submitReschedule);

module.exports = router;
