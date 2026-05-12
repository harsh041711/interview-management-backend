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
const myInterviewRoutes = require('./myInterviewRoutes');
const reviewEditRequestRoutes = require('./reviewEditRequestRoutes');
const reviewRoutes = require('./reviewRoutes');
const jobDescriptionRoutes = require('./jobDescriptionRoutes');
const codingProblemRoutes = require('./codingProblemRoutes');
const codingTestPublicRoutes = require('./codingTestPublicRoutes');
const codingSubmissionRoutes = require('./codingSubmissionRoutes');

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
router.use('/me', myInterviewRoutes);
router.use('/review-edit-requests', reviewEditRequestRoutes);
router.use('/reviews', reviewRoutes);
router.use('/job-descriptions', jobDescriptionRoutes);
router.use('/coding-problems', codingProblemRoutes);
router.use('/coding-test', codingTestPublicRoutes);
router.use('/coding-submissions', codingSubmissionRoutes);

module.exports = router;
