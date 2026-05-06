'use strict';

const express = require('express');
const validate = require('../middlewares/validator');
const { requireAuth } = require('../middlewares/authMiddleware');
const interviewerController = require('../controllers/interviewerController');
const {
  createInterviewerSchema,
  updateInterviewerSchema,
  idParamSchema,
  listInterviewersSchema,
} = require('../validators/interviewerValidator');

const router = express.Router();

router.use(requireAuth);

router.post('/', validate(createInterviewerSchema), interviewerController.createInterviewer);
router.get('/', validate(listInterviewersSchema), interviewerController.listInterviewers);
router.get('/:id', validate(idParamSchema), interviewerController.getInterviewer);
router.put('/:id', validate(updateInterviewerSchema), interviewerController.updateInterviewer);
router.delete('/:id', validate(idParamSchema), interviewerController.deleteInterviewer);

module.exports = router;
