'use strict';

process.env.MONGODB_URI = 'mongodb://localhost/test';
process.env.JWT_SECRET = 'test-jwt-secret-1234567890';
process.env.TEST_TOKEN_SECRET = 'test-token-secret-abcdefghij';
process.env.INTERVIEW_TOKEN_SECRET = 'test-interview-token-secret-xyz';
process.env.FRONTEND_URL = 'http://localhost:5173';

jest.mock('../../src/repositories/codingProblemRepository');
jest.mock('../../src/services/codingProblemAiService', () => ({
  generateFullProblem: jest.fn(),
}));

const cpService = require('../../src/services/codingProblemService');
const cpRepo = require('../../src/repositories/codingProblemRepository');
const cpAi = require('../../src/services/codingProblemAiService');

describe('codingProblemService.create', () => {
  beforeEach(() => jest.clearAllMocks());

  test('creates problem with createdBy stamp', async () => {
    cpRepo.create.mockResolvedValue({ id: 'p1', title: 'T' });
    const result = await cpService.create({ title: 'T', techStack: ['react'] }, 'admin1');
    expect(cpRepo.create).toHaveBeenCalledWith(expect.objectContaining({ title: 'T', createdBy: 'admin1' }));
    expect(result.id).toBe('p1');
  });
});

describe('codingProblemService.deactivate', () => {
  beforeEach(() => jest.clearAllMocks());

  test('soft-deletes by setting isActive=false', async () => {
    cpRepo.findById.mockResolvedValue({ id: 'p1', isActive: true });
    cpRepo.updateById.mockResolvedValue({ id: 'p1', isActive: false });
    await cpService.deactivate('p1');
    expect(cpRepo.updateById).toHaveBeenCalledWith('p1', { isActive: false });
  });

  test('404 when not found', async () => {
    cpRepo.findById.mockResolvedValue(null);
    await expect(cpService.deactivate('p1')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('codingProblemService.sampleForCandidate', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns problems from bank when enough exist', async () => {
    const bank = [
      { id: 'p1', _id: 'p1', title: 'A' },
      { id: 'p2', _id: 'p2', title: 'B' },
    ];
    cpRepo.sampleActive.mockResolvedValue(bank);
    cpRepo.incrementTimesUsed.mockResolvedValue();
    const result = await cpService.sampleForCandidate({
      techStacks: ['react'], difficulty: 'easy', problemCount: 2, adminId: 'admin1',
    });
    expect(result).toHaveLength(2);
    expect(cpAi.generateFullProblem).not.toHaveBeenCalled();
    expect(cpRepo.incrementTimesUsed).toHaveBeenCalledWith(['p1', 'p2']);
  });

  test('AI-fills missing problems when bank short', async () => {
    cpRepo.sampleActive.mockResolvedValue([{ id: 'p1', _id: 'p1', title: 'A' }]);
    cpAi.generateFullProblem.mockResolvedValue({
      title: 'AI Problem', description: 'd', difficulty: 'easy',
      supportedLanguages: ['js', 'python', 'php'], starterCode: { js: '', python: '', php: '' },
      testCases: [{ stdin: '', expectedStdout: '', isHidden: true }],
    });
    cpRepo.create.mockResolvedValue({ id: 'ai1', _id: 'ai1', title: 'AI Problem' });
    cpRepo.incrementTimesUsed.mockResolvedValue();
    const result = await cpService.sampleForCandidate({
      techStacks: ['react'], difficulty: 'easy', problemCount: 2, adminId: 'admin1',
    });
    expect(result).toHaveLength(2);
    expect(cpAi.generateFullProblem).toHaveBeenCalledTimes(1);
    expect(cpRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      title: 'AI Problem', source: 'ai', techStack: ['react'], createdBy: 'admin1',
    }));
  });

  test('throws E_NO_PROBLEMS when bank empty and AI fails', async () => {
    cpRepo.sampleActive.mockResolvedValue([]);
    cpAi.generateFullProblem.mockResolvedValue(null);
    await expect(cpService.sampleForCandidate({
      techStacks: ['rust'], difficulty: 'hard', problemCount: 1, adminId: 'admin1',
    })).rejects.toMatchObject({ code: 'E_NO_PROBLEMS' });
  });
});
