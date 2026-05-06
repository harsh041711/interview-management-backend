'use strict';

const express = require('express');
const validate = require('../middlewares/validator');
const { requireAuth } = require('../middlewares/authMiddleware');
const candidateController = require('../controllers/candidateController');
const {
  createCandidateSchema,
  idParamSchema,
  listCandidatesSchema,
} = require('../validators/candidateValidator');

const router = express.Router();

router.use(requireAuth);

router.post('/', validate(createCandidateSchema), candidateController.createCandidate);
router.get('/', validate(listCandidatesSchema), candidateController.listCandidates);
router.get('/stats', candidateController.stats);
router.get('/:id', validate(idParamSchema), candidateController.getCandidate);
router.post('/:id/regenerate-token', validate(idParamSchema), candidateController.regenerateToken);
router.post('/:id/resend-invite', validate(idParamSchema), candidateController.resendInvite);
router.delete('/:id', validate(idParamSchema), candidateController.deleteCandidate);

module.exports = router;
