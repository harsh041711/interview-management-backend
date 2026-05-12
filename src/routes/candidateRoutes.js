'use strict';

const express = require('express');
const validate = require('../middlewares/validator');
const { requireAuth } = require('../middlewares/authMiddleware');
const { singleResume } = require('../middlewares/upload');
const candidateController = require('../controllers/candidateController');
const {
  createCandidateSchema,
  idParamSchema,
  listCandidatesSchema,
  rejectSchema,
} = require('../validators/candidateValidator');

const router = express.Router();

router.use(requireAuth);

router.post('/', validate(createCandidateSchema), candidateController.createCandidate);
router.get('/', validate(listCandidatesSchema), candidateController.listCandidates);
router.get('/stats', candidateController.stats);
router.get('/:id', validate(idParamSchema), candidateController.getCandidate);
router.post('/:id/regenerate-token', validate(idParamSchema), candidateController.regenerateToken);
router.post('/:id/resend-invite', validate(idParamSchema), candidateController.resendInvite);
router.post('/:id/select', validate(idParamSchema), candidateController.selectCandidate);
router.post('/:id/reject', validate(rejectSchema), candidateController.rejectCandidate);
router.post('/:id/resume/approve', validate(idParamSchema), candidateController.approveResume);
router.post('/:id/resume/decline', validate(idParamSchema), candidateController.declineResume);
router.post('/:id/resume/rescreen', validate(idParamSchema), candidateController.rescreenResume);
router.post('/:id/send-test', validate(idParamSchema), candidateController.sendTest);
router.post('/:id/resume', singleResume('resume'), validate(idParamSchema), candidateController.uploadResume);
router.delete('/:id/resume', validate(idParamSchema), candidateController.removeResume);
router.delete('/:id', validate(idParamSchema), candidateController.deleteCandidate);

module.exports = router;
