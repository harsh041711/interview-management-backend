'use strict';
const express = require('express');
const validate = require('../middlewares/validator');
const { codingRunLimiter } = require('../middlewares/rateLimiter');
const ctrl = require('../controllers/liveCodingTaskController');
const v = require('../validators/liveCodingTaskValidator');

const router = express.Router();

router.get('/:token',         validate(v.tokenParamSchema), ctrl.getPublic);
router.post('/:token/run',    codingRunLimiter, validate(v.runSchema), ctrl.run);
router.post('/:token/submit', validate(v.submitSchema), ctrl.submit);

module.exports = router;
