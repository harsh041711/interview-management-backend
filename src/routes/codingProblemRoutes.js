'use strict';

const express = require('express');
const validate = require('../middlewares/validator');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');
const ctrl = require('../controllers/codingProblemController');
const {
  createSchema, updateSchema, idParamSchema, listSchema,
  aiStarterCodeSchema, aiFullProblemSchema,
} = require('../validators/codingProblemValidator');

const router = express.Router();

router.use(requireAuth, requireRole('admin'));

router.post('/', validate(createSchema), ctrl.createProblem);
router.get('/', validate(listSchema), ctrl.listProblems);
router.post('/ai/starter-code', validate(aiStarterCodeSchema), ctrl.aiStarterCode);
router.post('/ai/full-problem', validate(aiFullProblemSchema), ctrl.aiFullProblem);
router.get('/:id', validate(idParamSchema), ctrl.getProblem);
router.patch('/:id', validate(updateSchema), ctrl.updateProblem);
router.delete('/:id', validate(idParamSchema), ctrl.deactivateProblem);

module.exports = router;
