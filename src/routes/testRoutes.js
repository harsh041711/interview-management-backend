'use strict';

const express = require('express');
const validate = require('../middlewares/validator');
const { requireCandidateToken } = require('../middlewares/tokenMiddleware');
const { singlePhoto } = require('../middlewares/upload');
const { testStartLimiter } = require('../middlewares/rateLimiter');
const testController = require('../controllers/testController');
const { submitSchema, autoSubmitSchema } = require('../validators/testValidator');

const router = express.Router();

router.use(requireCandidateToken);

router.get('/validate', testController.validate);
router.post('/photo', singlePhoto('photo'), testController.uploadPhoto);
router.post('/start', testStartLimiter, testController.startTest);
router.post('/submit', validate(submitSchema), testController.submitTest);
router.post('/auto-submit', validate(autoSubmitSchema), testController.autoSubmitTest);

module.exports = router;
