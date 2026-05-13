'use strict';
const express = require('express');
const validate = require('../middlewares/validator');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');
const { requireMyInterview } = require('../middlewares/myInterviewMiddleware');
const ctrl = require('../controllers/myInterviewController');
const { idParamSchema } = require('../validators/interviewValidator');
const { reviewSubmitSchema, reviewEditSchema, editRequestSchema } = require('../validators/reviewValidator');

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

module.exports = router;
