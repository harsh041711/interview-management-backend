'use strict';

process.env.MONGODB_URI = 'mongodb://localhost/test';
process.env.JWT_SECRET = 'test-jwt-secret-1234567890';

jest.mock('../../src/repositories/liveCodingTaskRepository');
jest.mock('../../src/repositories/interviewRepository');
jest.mock('../../src/repositories/candidateRepository');
jest.mock('../../src/repositories/liveSessionRepository');
jest.mock('../../src/services/codingProblemAiService', () => ({
  generateFullProblem: jest.fn(),
}));
jest.mock('../../src/services/codingExecutionService', () => ({
  runAllTestCases: jest.fn(),
}));

const taskRepo = require('../../src/repositories/liveCodingTaskRepository');
const interviewRepo = require('../../src/repositories/interviewRepository');
const candidateRepo = require('../../src/repositories/candidateRepository');
const liveSessionRepo = require('../../src/repositories/liveSessionRepository');
const aiService = require('../../src/services/codingProblemAiService');
const execService = require('../../src/services/codingExecutionService');
const svc = require('../../src/services/liveCodingTaskService');

const INTERVIEWER = 'i1';
const INTERVIEW_ID = 'iv1';
const CANDIDATE_ID = 'c1';

const baseInterview = (overrides = {}) => ({
  _id: INTERVIEW_ID, id: INTERVIEW_ID,
  candidate: { _id: CANDIDATE_ID, id: CANDIDATE_ID },
  interviewer: INTERVIEWER,
  status: 'scheduled',
  role: 'Backend Engineer',
  ...overrides,
});

const baseAiProblem = () => ({
  title: 'Sum two numbers',
  description: 'Read two ints from stdin, print their sum.',
  difficulty: 'easy',
  supportedLanguages: ['js'],
  starterCode: { js: '// starter', python: '', php: '' },
  testCases: [
    { stdin: '1 2', expectedStdout: '3', isHidden: false },
    { stdin: '4 5', expectedStdout: '9', isHidden: true },
  ],
});

beforeEach(() => {
  jest.clearAllMocks();
  interviewRepo.findByIdPopulated = jest.fn().mockResolvedValue(baseInterview());
  candidateRepo.findById = jest.fn().mockResolvedValue({
    _id: CANDIDATE_ID,
    screening: { jdSnapshot: { title: 'Backend Eng', jobRole: 'API engineer' } },
  });
  liveSessionRepo.findActiveByInterview = jest.fn().mockResolvedValue(null);
  aiService.generateFullProblem.mockResolvedValue(baseAiProblem());
  taskRepo.create = jest.fn().mockImplementation((doc) => Promise.resolve({
    ...doc, _id: 't1', id: 't1', toObject() { return { ...this }; },
  }));
});

describe('liveCodingTaskService.create', () => {
  test('generates problem via AI and persists task with token + starter code', async () => {
    const task = await svc.create({
      interviewId: INTERVIEW_ID, interviewerId: INTERVIEWER,
      difficulty: 'easy', language: 'js',
    });

    expect(aiService.generateFullProblem).toHaveBeenCalledWith({
      topic: 'API engineer', difficulty: 'easy', languages: ['js'],
    });
    expect(taskRepo.create).toHaveBeenCalled();
    const created = taskRepo.create.mock.calls[0][0];
    expect(created.interview).toBe(INTERVIEW_ID);
    expect(created.interviewer).toBe(INTERVIEWER);
    expect(created.candidate).toBe(CANDIDATE_ID);
    expect(typeof created.token).toBe('string');
    expect(created.token.length).toBeGreaterThanOrEqual(32);
    expect(created.problem.language).toBe('js');
    expect(created.problem.starterCode).toBe('// starter');
    expect(created.problem.testCases).toHaveLength(2);
    expect(task.id).toBe('t1');
  });

  test('links liveSession when one is active for the interview', async () => {
    liveSessionRepo.findActiveByInterview = jest.fn().mockResolvedValue({ _id: 's1', id: 's1' });
    await svc.create({ interviewId: INTERVIEW_ID, interviewerId: INTERVIEWER, difficulty: 'easy', language: 'js' });
    expect(taskRepo.create.mock.calls[0][0].liveSession).toBe('s1');
  });

  test('rejects if interview status is not scheduled', async () => {
    interviewRepo.findByIdPopulated = jest.fn().mockResolvedValue(baseInterview({ status: 'cancelled' }));
    await expect(svc.create({
      interviewId: INTERVIEW_ID, interviewerId: INTERVIEWER, difficulty: 'easy', language: 'js',
    })).rejects.toMatchObject({ statusCode: 409 });
  });

  test('rejects if AI returns null', async () => {
    aiService.generateFullProblem.mockResolvedValue(null);
    await expect(svc.create({
      interviewId: INTERVIEW_ID, interviewerId: INTERVIEWER, difficulty: 'easy', language: 'js',
    })).rejects.toMatchObject({ statusCode: 503 });
  });

  test('rejects if interview is not found', async () => {
    interviewRepo.findByIdPopulated = jest.fn().mockResolvedValue(null);
    await expect(svc.create({
      interviewId: INTERVIEW_ID, interviewerId: INTERVIEWER, difficulty: 'easy', language: 'js',
    })).rejects.toMatchObject({ statusCode: 404 });
  });
});

const baseStoredTask = (overrides = {}) => ({
  _id: 't1', id: 't1',
  token: 'tok-123',
  status: 'pending',
  problem: {
    language: 'js',
    starterCode: '// starter',
    testCases: [
      { stdin: '1 2', expectedStdout: '3', isHidden: false },
      { stdin: '4 5', expectedStdout: '9', isHidden: true },
    ],
  },
  submission: null,
  toObject() { return { ...this }; },
  ...overrides,
});

describe('liveCodingTaskService.getPublic', () => {
  test('returns 404 when token is unknown', async () => {
    taskRepo.findByToken = jest.fn().mockResolvedValue(null);
    await expect(svc.getPublic({ token: 'bad' })).rejects.toMatchObject({ statusCode: 404 });
  });

  test('returns 410 when task is cancelled', async () => {
    taskRepo.findByToken = jest.fn().mockResolvedValue(baseStoredTask({ status: 'cancelled' }));
    await expect(svc.getPublic({ token: 'tok-123' })).rejects.toMatchObject({ statusCode: 410 });
  });

  test('flips pending → opened on first GET and sets openedAt', async () => {
    const stored = baseStoredTask();
    taskRepo.findByToken = jest.fn().mockResolvedValue(stored);
    taskRepo.updateById = jest.fn().mockImplementation((id, patch) => Promise.resolve({
      ...stored, ...patch, toObject() { return { ...this }; },
    }));
    const out = await svc.getPublic({ token: 'tok-123' });
    expect(taskRepo.updateById).toHaveBeenCalledWith('t1', expect.objectContaining({
      status: 'opened',
      openedAt: expect.any(Date),
    }));
    expect(out.status).toBe('opened');
  });

  test('does not flip status if already opened', async () => {
    taskRepo.findByToken = jest.fn().mockResolvedValue(baseStoredTask({ status: 'opened' }));
    taskRepo.updateById = jest.fn();
    await svc.getPublic({ token: 'tok-123' });
    expect(taskRepo.updateById).not.toHaveBeenCalled();
  });

  test('strips expectedStdout from hidden test cases but keeps visible ones', async () => {
    taskRepo.findByToken = jest.fn().mockResolvedValue(baseStoredTask({ status: 'opened' }));
    const out = await svc.getPublic({ token: 'tok-123' });
    expect(out.problem.testCases[0].expectedStdout).toBe('3'); // visible kept
    expect(out.problem.testCases[1].expectedStdout).toBeUndefined(); // hidden stripped
  });

  test('strips internal fields (token, interviewer, liveSession) from response', async () => {
    taskRepo.findByToken = jest.fn().mockResolvedValue(baseStoredTask({ status: 'opened', interviewer: 'i1', liveSession: 's1' }));
    const out = await svc.getPublic({ token: 'tok-123' });
    expect(out.token).toBeUndefined();
    expect(out.interviewer).toBeUndefined();
    expect(out.liveSession).toBeUndefined();
  });
});

describe('liveCodingTaskService.runPublic', () => {
  test('returns 404 for unknown token', async () => {
    taskRepo.findByToken = jest.fn().mockResolvedValue(null);
    await expect(svc.runPublic({ token: 'bad', code: 'x' })).rejects.toMatchObject({ statusCode: 404 });
  });

  test('rejects if already submitted', async () => {
    taskRepo.findByToken = jest.fn().mockResolvedValue(baseStoredTask({ status: 'submitted' }));
    await expect(svc.runPublic({ token: 'tok-123', code: 'x' })).rejects.toMatchObject({ statusCode: 409 });
  });

  test('rejects if cancelled', async () => {
    taskRepo.findByToken = jest.fn().mockResolvedValue(baseStoredTask({ status: 'cancelled' }));
    await expect(svc.runPublic({ token: 'tok-123', code: 'x' })).rejects.toMatchObject({ statusCode: 410 });
  });

  test('runs visible test cases only and does not persist', async () => {
    taskRepo.findByToken = jest.fn().mockResolvedValue(baseStoredTask({ status: 'opened' }));
    taskRepo.updateById = jest.fn();
    execService.runAllTestCases.mockResolvedValue([
      { stdin: '1 2', expectedStdout: '3', actualStdout: '3', stderr: '', passed: true, runtimeMs: 10, error: null },
    ]);
    const out = await svc.runPublic({ token: 'tok-123', code: 'console.log(3)' });
    expect(execService.runAllTestCases).toHaveBeenCalledWith({
      language: 'js',
      code: 'console.log(3)',
      testCases: [{ stdin: '1 2', expectedStdout: '3', isHidden: false }],
    });
    expect(taskRepo.updateById).not.toHaveBeenCalled();
    expect(out.results).toHaveLength(1);
    expect(out.results[0].passed).toBe(true);
  });
});

describe('liveCodingTaskService.submitPublic', () => {
  test('rejects if already submitted', async () => {
    taskRepo.findByToken = jest.fn().mockResolvedValue(baseStoredTask({ status: 'submitted' }));
    await expect(svc.submitPublic({ token: 'tok-123', code: 'x' })).rejects.toMatchObject({ statusCode: 409 });
  });

  test('runs ALL test cases, persists submission, flips status to submitted', async () => {
    const stored = baseStoredTask({ status: 'opened' });
    taskRepo.findByToken = jest.fn().mockResolvedValue(stored);
    taskRepo.updateById = jest.fn().mockImplementation((id, patch) => Promise.resolve({
      ...stored, ...patch, toObject() { return { ...this }; },
    }));
    execService.runAllTestCases.mockResolvedValue([
      { stdin: '1 2', expectedStdout: '3', actualStdout: '3', passed: true,  stderr: '', runtimeMs: 1, error: null },
      { stdin: '4 5', expectedStdout: '9', actualStdout: '8', passed: false, stderr: '', runtimeMs: 1, error: null },
    ]);
    const out = await svc.submitPublic({ token: 'tok-123', code: 'foo' });
    expect(execService.runAllTestCases).toHaveBeenCalledWith({
      language: 'js',
      code: 'foo',
      testCases: stored.problem.testCases,
    });
    const patch = taskRepo.updateById.mock.calls[0][1];
    expect(patch.status).toBe('submitted');
    expect(patch.submission.code).toBe('foo');
    expect(patch.submission.summary).toEqual({ passed: 1, total: 2 });
    expect(out.summary).toEqual({ passed: 1, total: 2 });
  });
});

describe('liveCodingTaskService.listForInterview', () => {
  test('returns all tasks for the interview, newest first', async () => {
    taskRepo.listByInterview = jest.fn().mockResolvedValue([
      { _id: 't2', id: 't2', toObject() { return { ...this }; } },
      { _id: 't1', id: 't1', toObject() { return { ...this }; } },
    ]);
    const out = await svc.listForInterview({ interviewId: INTERVIEW_ID, interviewerId: INTERVIEWER });
    expect(taskRepo.listByInterview).toHaveBeenCalledWith(INTERVIEW_ID);
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe('t2');
  });
});

describe('liveCodingTaskService.cancel', () => {
  test('cancels a pending task', async () => {
    const stored = baseStoredTask({ status: 'pending', interviewer: INTERVIEWER });
    taskRepo.findById = jest.fn().mockResolvedValue(stored);
    taskRepo.updateById = jest.fn().mockImplementation((id, patch) => Promise.resolve({ ...stored, ...patch, toObject() { return { ...this }; } }));
    const out = await svc.cancel({ taskId: 't1', interviewerId: INTERVIEWER });
    expect(taskRepo.updateById).toHaveBeenCalledWith('t1', { status: 'cancelled' });
    expect(out.status).toBe('cancelled');
  });

  test('rejects if not the owning interviewer', async () => {
    taskRepo.findById = jest.fn().mockResolvedValue(baseStoredTask({ status: 'pending', interviewer: 'someone-else' }));
    await expect(svc.cancel({ taskId: 't1', interviewerId: INTERVIEWER })).rejects.toMatchObject({ statusCode: 403 });
  });

  test('rejects if task is already submitted', async () => {
    taskRepo.findById = jest.fn().mockResolvedValue(baseStoredTask({ status: 'submitted', interviewer: INTERVIEWER }));
    await expect(svc.cancel({ taskId: 't1', interviewerId: INTERVIEWER })).rejects.toMatchObject({ statusCode: 409 });
  });

  test('rejects if task not found', async () => {
    taskRepo.findById = jest.fn().mockResolvedValue(null);
    await expect(svc.cancel({ taskId: 't1', interviewerId: INTERVIEWER })).rejects.toMatchObject({ statusCode: 404 });
  });
});
