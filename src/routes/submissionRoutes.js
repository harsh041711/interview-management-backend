'use strict';

const express = require('express');
const validate = require('../middlewares/validator');
const { requireAuth } = require('../middlewares/authMiddleware');
const submissionController = require('../controllers/submissionController');

const router = express.Router();

router.use(requireAuth);

router.get('/', validate(submissionController.schemas.list), submissionController.listSubmissions);
router.get('/by-candidate/:candidateId', validate(submissionController.schemas.candidateId), submissionController.getByCandidate);
router.get('/:id', validate(submissionController.schemas.id), submissionController.getSubmission);

module.exports = router;
