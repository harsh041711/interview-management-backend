'use strict';

const express = require('express');
const { requireAuth } = require('../middlewares/authMiddleware');
const integrationsController = require('../controllers/integrationsController');

const router = express.Router();

// Public — Google calls this via 302 redirect from the consent screen.
router.get('/google/callback', integrationsController.googleCallback);

// Admin-only
router.use(requireAuth);
router.get('/google/connect', integrationsController.googleConnect);
router.get('/google/status', integrationsController.googleStatus);
router.post('/google/disconnect', integrationsController.googleDisconnect);

module.exports = router;
