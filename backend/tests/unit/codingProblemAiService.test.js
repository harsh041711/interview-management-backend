'use strict';

process.env.MONGODB_URI = 'mongodb://localhost/test';
process.env.JWT_SECRET = 'test-jwt-secret-1234567890';
process.env.TEST_TOKEN_SECRET = 'test-token-secret-abcdefghij';
process.env.INTERVIEW_TOKEN_SECRET = 'test-interview-token-secret-xyz';
process.env.FRONTEND_URL = 'http://localhost:5173';

jest.mock('../../src/services/aiService', () => ({
  askWithFallback: jest.fn(),
  extractJson: jest.fn(),
}));

const aiService = require('../../src/services/aiService');
const codingAi = require('../../src/services/codingProblemAiService');

describe('codingProblemAiService.generateStarterCode', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns code string on success', async () => {
    aiService.askWithFallback.mockResolvedValue({ text: 'def solve():\n    pass', provider: 'gemini', model: 'gemini-2.5-flash' });
    const result = await codingAi.generateStarterCode({ description: 'sum n nums', language: 'python' });
    expect(result).toContain('def solve');
  });

  test('returns null when AI text is null', async () => {
    aiService.askWithFallback.mockResolvedValue({ text: null });
    const result = await codingAi.generateStarterCode({ description: 'x', language: 'python' });
    expect(result).toBeNull();
  });
});

describe('codingProblemAiService.generateFullProblem', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns parsed problem when AI returns valid JSON', async () => {
    aiService.askWithFallback.mockResolvedValue({ text: '{}', provider: 'gemini', model: 'gemini-2.5-flash' });
    aiService.extractJson.mockReturnValue({
      title: 'Sum of N',
      description: 'add em up',
      starterCode: { js: 'function s(){}', python: 'def s():\n    pass', php: '<?php ?>' },
      testCases: [{ stdin: '1 2', expectedStdout: '3', isHidden: false }],
    });
    const result = await codingAi.generateFullProblem({ topic: 'arrays', difficulty: 'easy', languages: ['js','python','php'] });
    expect(result.title).toBe('Sum of N');
    expect(result.testCases).toHaveLength(1);
  });

  test('returns null when AI fails', async () => {
    aiService.askWithFallback.mockResolvedValue({ text: null });
    const result = await codingAi.generateFullProblem({ topic: 'x', difficulty: 'easy', languages: ['js'] });
    expect(result).toBeNull();
  });

  test('returns null when JSON parse fails', async () => {
    aiService.askWithFallback.mockResolvedValue({ text: 'nope' });
    aiService.extractJson.mockReturnValue(null);
    const result = await codingAi.generateFullProblem({ topic: 'x', difficulty: 'easy', languages: ['js'] });
    expect(result).toBeNull();
  });

  test('returns null when required fields missing', async () => {
    aiService.askWithFallback.mockResolvedValue({ text: '{}' });
    aiService.extractJson.mockReturnValue({ title: 'x' });
    const result = await codingAi.generateFullProblem({ topic: 'x', difficulty: 'easy', languages: ['js'] });
    expect(result).toBeNull();
  });
});
