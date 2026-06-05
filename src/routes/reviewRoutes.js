'use strict';
const express = require('express');
const validate = require('../middlewares/validator');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');
const ctrl = require('../controllers/reviewController');
const { reviewByCandidateSchema, reviewByIdSchema } = require('../validators/reviewValidator');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

router.get('/', validate(reviewByCandidateSchema), ctrl.getByCandidate);
router.get('/:id', validate(reviewByIdSchema), ctrl.getOne);

module.exports = router;
