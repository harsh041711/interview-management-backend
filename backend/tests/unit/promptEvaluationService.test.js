jest.mock('../../src/services/aiService', () => {
  const actual = jest.requireActual('../../src/services/aiService');
  return { ...actual, askWithFallback: jest.fn() };
});
const aiService = require('../../src/services/aiService');
const promptSubmissionRepository = require('../../src/repositories/promptSubmissionRepository');
jest.mock('../../src/repositories/promptSubmissionRepository');

const svc = require('../../src/services/promptEvaluationService');
const { PROMPT_SUBMISSION_STATUS } = require('../../src/utils/constants');

const baseSub = {
  _id: 'sub1', id: 'sub1',
  candidatePrompt: 'Summarize the email:',
  promptProblem: {
    description: 'Summarize support emails',
    sampleInput: 'Hello, my order is late',
    expectedOutputCriteria: ['Identifies subject', 'Suggests next step'],
    customRubricCriteria: ['Uses bullet points'],
  },
  status: PROMPT_SUBMISSION_STATUS.SUBMITTED,
};

describe('promptEvaluationService.evaluate', () => {
  beforeEach(() => jest.clearAllMocks());

  test('happy path: scores rubric, executes, scores output, marks evaluated', async () => {
    promptSubmissionRepository.findById.mockResolvedValue(baseSub);
    aiService.askWithFallback
      .mockResolvedValueOnce({ text: JSON.stringify({ items: [
        { criterion: 'Clarity', score: 5, notes: 'ok' },
        { criterion: 'Role',    score: 4, notes: 'ok' },
        { criterion: 'Format',  score: 3, notes: 'ok' },
        { criterion: 'Examples',score: 2, notes: 'none' },
        { criterion: 'Edge',    score: 4, notes: 'ok' },
        { criterion: 'Uses bullet points', score: 5, notes: 'yes' },
      ]}), provider: 'gemini', model: 'g-2.5' })
      .mockResolvedValueOnce({ text: '- subject: late order\n- next: refund', provider: 'gemini', model: 'g-2.5' })
      .mockResolvedValueOnce({ text: JSON.stringify({ items: [
        { criterion: 'Identifies subject', pass: true, notes: 'yes' },
        { criterion: 'Suggests next step', pass: true, notes: 'yes' },
      ]}), provider: 'gemini', model: 'g-2.5' });
    promptSubmissionRepository.updateById.mockResolvedValue({ ...baseSub, status: PROMPT_SUBMISSION_STATUS.EVALUATED });

    await svc.evaluate('sub1');

    const patch = promptSubmissionRepository.updateById.mock.calls.find((c) =>
      c[1].status === PROMPT_SUBMISSION_STATUS.EVALUATED,
    )[1];
    expect(patch.evaluation.rubricScore).toBeGreaterThan(0);
    expect(patch.evaluation.outputScore).toBe(50);
    expect(patch.evaluation.totalScore).toBe(patch.evaluation.rubricScore + 50);
    expect(patch.evaluation.executionOutput).toContain('subject');
    expect(patch.evaluation.aiProviderUsed).toBe('gemini:g-2.5');
  });

  test('marks evaluation_failed when rubric AI returns nothing', async () => {
    promptSubmissionRepository.findById.mockResolvedValue(baseSub);
    aiService.askWithFallback.mockResolvedValueOnce({ text: null });
    promptSubmissionRepository.updateById.mockResolvedValue(baseSub);

    await svc.evaluate('sub1');

    const failPatch = promptSubmissionRepository.updateById.mock.calls.find((c) =>
      c[1].status === PROMPT_SUBMISSION_STATUS.EVALUATION_FAILED,
    );
    expect(failPatch).toBeTruthy();
    expect(failPatch[1].evaluation.aiNotes).toMatch(/rubric/i);
  });

  test('counts partial output pass correctly', async () => {
    promptSubmissionRepository.findById.mockResolvedValue(baseSub);
    aiService.askWithFallback
      .mockResolvedValueOnce({ text: JSON.stringify({ items: [{ criterion: 'A', score: 5, notes: '' }]}), provider: 'g', model: 'm' })
      .mockResolvedValueOnce({ text: 'output', provider: 'g', model: 'm' })
      .mockResolvedValueOnce({ text: JSON.stringify({ items: [
        { criterion: 'Identifies subject', pass: true, notes: '' },
        { criterion: 'Suggests next step', pass: false, notes: '' },
      ]}), provider: 'g', model: 'm' });
    promptSubmissionRepository.updateById.mockResolvedValue(baseSub);

    await svc.evaluate('sub1');

    const finalPatch = promptSubmissionRepository.updateById.mock.calls.find((c) =>
      c[1].status === PROMPT_SUBMISSION_STATUS.EVALUATED,
    )[1];
    expect(finalPatch.evaluation.outputScore).toBe(25);
  });
});
