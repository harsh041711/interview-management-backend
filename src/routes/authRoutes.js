'use strict';

const express = require('express');
const validate = require('../middlewares/validator');
const { loginLimiter } = require('../middlewares/rateLimiter');
const { requireAuth } = require('../middlewares/authMiddleware');
const authController = require('../controllers/authController');
const { registerSchema, loginSchema } = require('../validators/authValidator');

const router = express.Router();

router.post('/register', validate(registerSchema), authController.register);
router.post('/login', loginLimiter, validate(loginSchema), authController.login);
router.get('/me', requireAuth, authController.me);

module.exports = router;
