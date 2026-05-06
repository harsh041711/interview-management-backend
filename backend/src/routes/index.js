'use strict';

const express = require('express');
const authRoutes = require('./authRoutes');
const candidateRoutes = require('./candidateRoutes');
const questionRoutes = require('./questionRoutes');
const testRoutes = require('./testRoutes');
const submissionRoutes = require('./submissionRoutes');
const interviewerRoutes = require('./interviewerRoutes');

const router = express.Router();

router.get('/health', (_req, res) => res.json({ success: true, status: 'ok', uptime: process.uptime() }));

router.use('/auth', authRoutes);
router.use('/candidates', candidateRoutes);
router.use('/questions', questionRoutes);
router.use('/test', testRoutes);
router.use('/submissions', submissionRoutes);
router.use('/interviewers', interviewerRoutes);

module.exports = router;
