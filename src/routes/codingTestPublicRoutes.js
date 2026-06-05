'use strict';

const express = require('express');
const validate = require('../middlewares/validator');
const { codingRunLimiter } = require('../middlewares/rateLimiter');
const ctrl = require('../controllers/codingTestPublicController');
const { submitSchema, tokenParamSchema, runSchema } = require('../validators/codingSubmissionValidator');

const router = express.Router();

router.get('/:token', validate(tokenParamSchema), ctrl.loadTest);
router.post('/:token/submit', validate(submitSchema), ctrl.submit);
router.post('/:token/run', codingRunLimiter, validate(runSchema), ctrl.run);

module.exports = router;
