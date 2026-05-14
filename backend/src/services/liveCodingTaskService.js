'use strict';

const crypto = require('crypto');
const taskRepo = require('../repositories/liveCodingTaskRepository');
const interviewRepo = require('../repositories/interviewRepository');
const candidateRepo = require('../repositories/candidateRepository');
const liveSessionRepo = require('../repositories/liveSessionRepository');
const aiService = require('./codingProblemAiService');
const execService = require('./codingExecutionService');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const { LIVE_CODING_TASK_STATUS, INTERVIEW_STATUS } = require('../utils/constants');

const toObj = (doc) => (doc && typeof doc.toObject === 'function' ? doc.toObject() : doc);

const generateToken = () => crypto.randomBytes(24).toString('hex');

const buildTopic = (candidate) => {
  const snap = candidate?.screening?.jdSnapshot;
  return snap?.jobRole || snap?.title || 'general programming';
};

const create = async ({ interviewId, interviewerId, difficulty, language }) => {
  const interview = await interviewRepo.findByIdPopulated(interviewId);
  if (!interview) throw ApiError.notFound('Interview not found');
  if (interview.status !== INTERVIEW_STATUS.SCHEDULED) {
    throw ApiError.conflict(`Cannot send a coding task while the interview is ${interview.status}`, { code: 'E_BAD_STATUS' });
  }

  const candidateId = (interview.candidate && (interview.candidate._id || interview.candidate.id)) || null;
  if (!candidateId) throw ApiError.badRequest('Interview has no candidate');

  const candidate = await candidateRepo.findById(candidateId);
  const topic = buildTopic(candidate);

  const aiProblem = await aiService.generateFullProblem({ topic, difficulty, languages: [language] });
  if (!aiProblem) {
    throw ApiError.serviceUnavailable('AI could not generate a problem — try again', { code: 'E_AI_FAILED' });
  }

  const starterCode = String(aiProblem.starterCode?.[language] || '');
  const testCases = (aiProblem.testCases || []).map((tc, idx) => ({
    stdin: String(tc.stdin || ''),
    expectedStdout: String(tc.expectedStdout || ''),
    isHidden: idx === 0 ? false : tc.isHidden !== false,
  }));

  const active = await liveSessionRepo.findActiveByInterview(interviewId);

  const created = await taskRepo.create({
    interview: interviewId,
    candidate: candidateId,
    interviewer: interviewerId,
    liveSession: active ? (active._id || active.id) : null,
    token: generateToken(),
    problem: {
      title: aiProblem.title,
      description: aiProblem.description,
      difficulty,
      language,
      starterCode,
      testCases,
    },
    status: LIVE_CODING_TASK_STATUS.PENDING,
  });

  logger.info('LiveCodingTask created', { interviewId, taskId: created._id || created.id });
  return toObj(created);
};

module.exports = { create };
