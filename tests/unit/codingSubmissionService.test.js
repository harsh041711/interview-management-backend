'use strict';

process.env.MONGODB_URI = 'mongodb://localhost/test';
process.env.JWT_SECRET = 'test-jwt-secret-1234567890';
process.env.TEST_TOKEN_SECRET = 'test-token-secret-abcdefghij';
process.env.INTERVIEW_TOKEN_SECRET = 'test-interview-token-secret-xyz';
process.env.FRONTEND_URL = 'http://localhost:5173';

jest.mock('../../src/repositories/candidateRepository');
jest.mock('../../src/repositories/codingSubmissionRepository');
jest.mock('../../src/repositories/codingProblemRepository');
jest.mock('../../src/services/codingExecutionService', () => ({
  runAllTestCases: jest.fn(),
}));
jest.mock('../../src/services/emailService', () => ({
  sendCodingSubmissionReceived: jest.fn(),
}));
jest.mock('../../src/utils/tokenGenerator', () => ({
  verifyTestToken: jest.fn(() => true),
  generateTestToken: jest.fn(),
}));

const candidateRepo = require('../../src/repositories/candidateRepository');
const subRepo = require('../../src/repositories/codingSubmissionRepository');
const cpRepo = require('../../src/repositories/codingProblemRepository');
const exec = require('../../src/services/codingExecutionService');
const codingSubService = require('../../src/services/codingSubmissionService');

const makeCandidate = (overrides = {}) => ({
  id: 'c1',
  _id: 'c1',
  name: 'Alice',
  email: 'alice@example.com',
  techStack: ['react'],
  codingTest: {
    token: 'tok1',
    expiresAt: new Date(Date.now() + 3600_000),
    problems: ['p1'],
    problemCount: 1,
    durationMinutes: 30,
    submittedAt: null,
    outcome: null,
  },
  save: jest.fn().mockResolvedValue(),
  ...overrides,
});

const makeProblem = () => ({
  id: 'p1', _id: 'p1', title: 'Sum',
  supportedLanguages: ['js', 'python', 'php'],
  testCases: [{ stdin: '1 2', expectedStdout: '3' }],
});

describe('codingSubmissionService.submitByToken', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects when token not found', async () => {
    candidateRepo.findByCodingTestToken = jest.fn().mockResolvedValue(null);
    await expect(codingSubService.submitByToken({
      token: 'bad',
      submissions: [{ problemId: 'p1', language: 'js', code: 'x' }],
      tabSwitches: 0,
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test('rejects when already submitted', async () => {
    const candidate = makeCandidate({ codingTest: { ...makeCandidate().codingTest, submittedAt: new Date() } });
    candidateRepo.findByCodingTestToken = jest.fn().mockResolvedValue(candidate);
    await expect(codingSubService.submitByToken({
      token: 'tok1',
      submissions: [{ problemId: 'p1', language: 'js', code: 'x' }],
      tabSwitches: 0,
    })).rejects.toMatchObject({ code: 'E_ALREADY_SUBMITTED' });
  });

  test('happy path: runs test cases, persists submissions, updates candidate, returns count', async () => {
    const candidate = makeCandidate();
    candidateRepo.findByCodingTestToken = jest.fn().mockResolvedValue(candidate);
    cpRepo.findById.mockResolvedValue(makeProblem());
    exec.runAllTestCases.mockResolvedValue([{ passed: true, stdin: '1 2', expectedStdout: '3', actualStdout: '3', stderr: '', exitCode: 0, runtimeMs: 100, error: null }]);
    subRepo.create.mockResolvedValue({ id: 's1', _id: 's1', problem: 'p1', language: 'js', passedCount: 1, totalCount: 1 });

    const result = await codingSubService.submitByToken({
      token: 'tok1',
      submissions: [{ problemId: 'p1', language: 'js', code: 'console.log(3)' }],
      tabSwitches: 2,
    });
    expect(result.submitted).toBe(1);
    expect(candidate.codingTest.submittedAt).toBeInstanceOf(Date);
    expect(candidate.codingTest.outcome).toBe('pending_review');
    expect(candidate.save).toHaveBeenCalled();
  });
});

describe('codingSubmissionService.rate', () => {
  beforeEach(() => jest.clearAllMocks());

  test('updates rating + comment + reviewedBy', async () => {
    const sub = { id: 's1', _id: 's1', candidate: 'c1', save: jest.fn().mockResolvedValue() };
    subRepo.findById.mockResolvedValue(sub);
    subRepo.updateById.mockResolvedValue({ ...sub, rating: 4, reviewComment: 'good' });
    await codingSubService.rate('s1', { rating: 4, reviewComment: 'good' }, 'admin1');
    expect(subRepo.updateById).toHaveBeenCalledWith('s1', expect.objectContaining({
      rating: 4, reviewComment: 'good', reviewedBy: 'admin1',
    }));
  });

  test('rejects rating out of range', async () => {
    subRepo.findById.mockResolvedValue({ id: 's1' });
    await expect(codingSubService.rate('s1', { rating: 10 }, 'admin1'))
      .rejects.toMatchObject({ statusCode: 400 });
  });
});
