'use strict';

const express = require('express');
const validate = require('../middlewares/validator');
const { requireAuth } = require('../middlewares/authMiddleware');
const questionController = require('../controllers/questionController');
const {
  createQuestionSchema,
  updateQuestionSchema,
  bulkSchema,
  generateSchema,
  listSchema,
  idParamSchema,
} = require('../validators/questionValidator');

const router = express.Router();

router.use(requireAuth);

router.post('/', validate(createQuestionSchema), questionController.createQuestion);
router.post('/bulk', validate(bulkSchema), questionController.bulkCreate);
router.post('/generate', validate(generateSchema), questionController.generateQuestions);
router.get('/tech-stacks', questionController.listTechStacks);
router.get('/', validate(listSchema), questionController.listQuestions);
router.put('/:id', validate(updateQuestionSchema), questionController.updateQuestion);
router.delete('/:id', validate(idParamSchema), questionController.deleteQuestion);

module.exports = router;
