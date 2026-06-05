'use strict';

const express = require('express');
const validate = require('../middlewares/validator');
const authController = require('../controllers/authController');
const { accountSetupSchema, accountSetupTokenParamSchema } = require('../validators/authValidator');

const router = express.Router();
router.get('/setup/:token', validate(accountSetupTokenParamSchema), authController.getAccountSetup);
router.post('/setup', validate(accountSetupSchema), authController.postAccountSetup);
module.exports = router;
