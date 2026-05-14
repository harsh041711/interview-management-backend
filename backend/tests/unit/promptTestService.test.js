jest.mock('../../src/repositories/promptProblemRepository');
jest.mock('../../src/repositories/promptSubmissionRepository');
jest.mock('../../src/repositories/candidateRepository');
jest.mock('../../src/services/promptEvaluationService');
jest.mock('../../src/services/emailService');
jest.mock('../../src/utils/tokenGenerator', () => ({
  generateTestToken: () => ({ token: 'tok-abc', expiresAt: new Date(Date.now() + 3600000) }),
}));

const problemRepo = require('../../src/repositories/promptProblemRepository');
const subRepo = require('../../src/repositories/promptSubmissionRepository');
const candidateRepo = require('../../src/repositories/candidateRepository');
const evalSvc = require('../../src/services/promptEvaluationService');

const svc = require('../../src/services/promptTestService');
const { PROMPT_SUBMISSION_STATUS } = require('../../src/utils/constants');

describe('promptTestService.assign', () => {
  beforeEach(() => jest.clearAllMocks());

  test('creates a submission and updates candidate.promptTest', async () => {
    candidateRepo.findById.mockResolvedValue({ id: 'c1', save: jest.fn(), promptTest: {} });
    problemRepo.findById.mockResolvedValue({ id: 'p1', durationMinutes: 20 });
    subRepo.create.mockResolvedValue({ id: 's1', accessToken: 'tok-abc' });

    const res = await svc.assign({ candidateId: 'c1', problemId: 'p1' });

    expect(subRepo.create).toHaveBeenCalled();
    expect(res.accessToken).toBe('tok-abc');
  });
});

describe('promptTestService.preview', () => {
  test('rejects when previewRunsUsed >= 5', async () => {
    subRepo.findByToken.mockResolvedValue({
      id: 's1', previewRunsUsed: 5,
      promptProblem: { sampleInput: 'in' },
      status: PROMPT_SUBMISSION_STATUS.IN_PROGRESS,
      submittedAt: null,
    });
    await expect(svc.preview({ token: 'x', candidatePrompt: 'p' })).rejects.toThrow(/limit/i);
  });

  test('rejects when already submitted', async () => {
    subRepo.findByToken.mockResolvedValue({
      id: 's1', previewRunsUsed: 0,
      promptProblem: { sampleInput: 'in' },
      submittedAt: new Date(),
    });
    await expect(svc.preview({ token: 'x', candidatePrompt: 'p' })).rejects.toThrow(/submitted/i);
  });

  test('runs preview and increments counter', async () => {
    subRepo.findByToken.mockResolvedValue({
      id: 's1', previewRunsUsed: 1,
      promptProblem: { sampleInput: 'in' },
      submittedAt: null,
    });
    evalSvc.runPreview.mockResolvedValue({ output: 'result', provider: 'g' });
    subRepo.incrementPreviewRuns.mockResolvedValue({});
    const res = await svc.preview({ token: 'x', candidatePrompt: 'p' });
    expect(res.output).toBe('result');
    expect(res.runsRemaining).toBe(3);
  });
});

describe('promptTestService.submit', () => {
  test('locks submission, queues evaluation', async () => {
    const sub = {
      id: 's1', submittedAt: null,
      promptProblem: { sampleInput: 'in' },
    };
    subRepo.findByToken.mockResolvedValue(sub);
    subRepo.updateById.mockResolvedValue({ ...sub, submittedAt: new Date() });
    candidateRepo.findById = jest.fn().mockResolvedValue({ id: 'c1', save: jest.fn(), promptTest: {} });

    await svc.submit({ token: 'x', candidatePrompt: 'final', candidateId: 'c1' });

    expect(subRepo.updateById).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ submittedAt: expect.any(Date), candidatePrompt: 'final' }),
    );
  });

  test('rejects double submit', async () => {
    subRepo.findByToken.mockResolvedValue({ id: 's1', submittedAt: new Date() });
    await expect(svc.submit({ token: 'x', candidatePrompt: 'p' })).rejects.toThrow(/already/i);
  });
});
