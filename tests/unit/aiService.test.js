'use strict';

process.env.MONGODB_URI = 'mongodb://localhost/test';
process.env.JWT_SECRET = 'test-jwt-secret-1234567890';
process.env.TEST_TOKEN_SECRET = 'test-token-secret-abcdefghij';
process.env.INTERVIEW_TOKEN_SECRET = 'test-interview-token-secret-xyz';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.GEMINI_API_KEY = 'test-gemini-key';
process.env.GROQ_API_KEY = 'test-groq-key';

const aiService = require('../../src/services/aiService');

describe('aiService.buildQuestionGenerationPrompt — type restriction', () => {
  test('restricts to the requested types only', () => {
    const prompt = aiService.buildQuestionGenerationPrompt({
      techStack: 'react', count: 10, types: ['mcq', 'multi_select'],
    });
    expect(prompt).toContain('mcq');
    expect(prompt).toContain('multi_select');
    expect(prompt).not.toContain('one_line');
    expect(prompt).not.toContain('descriptive');
    expect(prompt).toMatch(/Use ONLY these question types/i);
  });

  test('includes all four types when none are requested (mix mode)', () => {
    const prompt = aiService.buildQuestionGenerationPrompt({ techStack: 'react', count: 5 });
    expect(prompt).toContain('mcq');
    expect(prompt).toContain('multi_select');
    expect(prompt).toContain('one_line');
    expect(prompt).toContain('descriptive');
  });
});
