'use strict';

const express = require('express');
const Joi = require('joi');
const validate = require('../middlewares/validator');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');
const ctrl = require('../controllers/codingSubmissionController');
const { idParamSchema, rateSchema } = require('../validators/codingSubmissionValidator');

const listQuerySchema = {
  query: Joi.object({
    candidateId: Joi.string().hex().length(24).required(),
  }),
};

const router = express.Router();

router.use(requireAuth, requireRole('admin'));

router.get('/', validate(listQuerySchema), ctrl.listForCandidate);
router.post('/:id/rate', validate(rateSchema), ctrl.rate);
router.post('/:id/re-run', validate(idParamSchema), ctrl.rerun);

module.exports = router;
