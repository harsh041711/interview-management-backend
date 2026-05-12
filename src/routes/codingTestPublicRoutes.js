'use strict';

const express = require('express');
const validate = require('../middlewares/validator');
const ctrl = require('../controllers/codingTestPublicController');
const { submitSchema, tokenParamSchema } = require('../validators/codingSubmissionValidator');

const router = express.Router();

router.get('/:token', validate(tokenParamSchema), ctrl.loadTest);
router.post('/:token/submit', validate(submitSchema), ctrl.submit);

module.exports = router;
