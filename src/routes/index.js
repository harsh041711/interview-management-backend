'use strict';

const express = require('express');
const authRoutes = require('./authRoutes');
const accountRoutes = require('./accountRoutes');
const candidateRoutes = require('./candidateRoutes');
const questionRoutes = require('./questionRoutes');
const testRoutes = require('./testRoutes');
const submissionRoutes = require('./submissionRoutes');
const interviewerRoutes = require('./interviewerRoutes');
const interviewRoutes = require('./interviewRoutes');
const interviewPublicRoutes = require('./interviewPublicRoutes');

const router = express.Router();

router.get('/health', (_req, res) => res.json({ success: true, status: 'ok', uptime: process.uptime() }));

router.use('/auth', authRoutes);
router.use('/account', accountRoutes);
router.use('/candidates', candidateRoutes);
router.use('/questions', questionRoutes);
router.use('/test', testRoutes);
router.use('/submissions', submissionRoutes);
router.use('/interviewers', interviewerRoutes);
router.use('/interviews', interviewRoutes);
router.use('/interview', interviewPublicRoutes);

module.exports = router;
