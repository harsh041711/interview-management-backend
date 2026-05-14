'use strict';
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/promptTestPublicController');
const validate = require('../middlewares/validator');
const v = require('../validators/promptTestValidator');
const { promptPreviewLimiter } = require('../middlewares/rateLimiter');

router.get('/:token',          validate(v.tokenParamSchema), ctrl.fetch);
router.post('/:token/preview', promptPreviewLimiter, validate(v.previewSchema), ctrl.preview);
router.post('/:token/submit',  validate(v.submitSchema),    ctrl.submit);

module.exports = router;
