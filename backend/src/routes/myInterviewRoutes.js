'use strict';
const express = require('express');
const validate = require('../middlewares/validator');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');
const { requireMyInterview } = require('../middlewares/myInterviewMiddleware');
const ctrl = require('../controllers/myInterviewController');
const { idParamSchema } = require('../validators/interviewValidator');
const { reviewSubmitSchema, reviewEditSchema, editRequestSchema } = require('../validators/reviewValidator');
const codingTaskCtrl = require('../controllers/liveCodingTaskController');
const codingTaskValidator = require('../validators/liveCodingTaskValidator');
const { aiLimiter } = require('../middlewares/rateLimiter');

const router = express.Router();
router.use(requireAuth, requireRole('interviewer'));

router.get('/interviews', ctrl.list);
router.get('/interviews/:id', validate(idParamSchema), requireMyInterview, ctrl.detail);
router.post(
  '/interviews/:id/review',
  validate({ params: idParamSchema.params, body: reviewSubmitSchema.body }),
  requireMyInterview,
  ctrl.submitReview,
);
router.patch('/reviews/:reviewId', validate(reviewEditSchema), ctrl.editReview);
router.post('/reviews/:reviewId/edit-request', validate(editRequestSchema), ctrl.requestEdit);

router.post(
  '/interviews/:id/coding-tasks',
  aiLimiter,
  validate(codingTaskValidator.createSchema),
  requireMyInterview,
  codingTaskCtrl.create,
);
router.get(
  '/interviews/:id/coding-tasks',
  validate(codingTaskValidator.interviewIdParam),
  requireMyInterview,
  codingTaskCtrl.list,
);
router.post(
  '/interviews/:id/coding-tasks/:taskId/cancel',
  validate(codingTaskValidator.cancelParamsSchema),
  requireMyInterview,
  codingTaskCtrl.cancel,
);

module.exports = router;
