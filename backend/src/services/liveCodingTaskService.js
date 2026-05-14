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

const stripPublicFields = (task) => {
  const out = toObj(task);
  delete out.token;
  delete out.interviewer;
  delete out.liveSession;
  delete out.submission; // candidate doesn't need to see their submission echoed back here
  // Hide expected output of hidden test cases — candidate can see visible samples only.
  if (out.problem && Array.isArray(out.problem.testCases)) {
    out.problem.testCases = out.problem.testCases.map((tc) => {
      if (tc.isHidden) {
        const { expectedStdout, ...rest } = tc;
        return rest;
      }
      return tc;
    });
  }
  return out;
};

const loadByTokenOrThrow = async (token) => {
  const t = await taskRepo.findByToken(token);
  if (!t) throw ApiError.notFound('Coding task not found', { code: 'E_NOT_FOUND' });
  if (t.status === LIVE_CODING_TASK_STATUS.CANCELLED) {
    throw ApiError.gone('Your interviewer cancelled this task', { code: 'E_CANCELLED' });
  }
  return t;
};

const getPublic = async ({ token }) => {
  const task = await loadByTokenOrThrow(token);
  let current = task;
  if (task.status === LIVE_CODING_TASK_STATUS.PENDING) {
    current = await taskRepo.updateById(task._id || task.id, {
      status: LIVE_CODING_TASK_STATUS.OPENED,
      openedAt: new Date(),
    });
  }
  return stripPublicFields(current);
};

const runPublic = async ({ token, code }) => {
  const task = await loadByTokenOrThrow(token);
  if (task.status === LIVE_CODING_TASK_STATUS.SUBMITTED) {
    throw ApiError.conflict('Task already submitted', { code: 'E_ALREADY_SUBMITTED' });
  }
  const visibleCases = (task.problem.testCases || []).filter((tc) => !tc.isHidden);
  const results = await execService.runAllTestCases({
    language: task.problem.language,
    code,
    testCases: visibleCases,
  });
  return { results };
};

module.exports = { create, getPublic, runPublic };
