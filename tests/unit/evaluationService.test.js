'use strict';

process.env.MONGODB_URI = 'mongodb://localhost/test';
process.env.JWT_SECRET = 'test-jwt-secret-1234567890';
process.env.TEST_TOKEN_SECRET = 'test-token-secret-abcdefghij';

jest.mock('../../src/services/aiService', () => ({
  evaluateDescriptive: jest.fn(async ({ maxScore }) => ({
    score: maxScore * 0.8,
    feedback: 'Solid answer.',
    isCorrect: true,
    provider: 'gemini',
  })),
}));

const evaluation = require('../../src/services/evaluationService');

const mcq = (overrides = {}) => ({
  _id: 'q1',
  type: 'mcq',
  marks: 2,
  question: 'Pick one',
  options: ['A', 'B', 'C', 'D'],
  correctAnswer: 'B',
  ...overrides,
});

describe('evaluationService', () => {
  test('mcq exact match', () => {
    const r = evaluation.evaluateMcq(mcq(), 'B');
    expect(r).toEqual({ isCorrect: true, score: 2, maxScore: 2, aiProvider: null });
  });

  test('mcq mismatch scores zero', () => {
    const r = evaluation.evaluateMcq(mcq(), 'A');
    expect(r.isCorrect).toBe(false);
    expect(r.score).toBe(0);
  });

  test('multi-select exact set match', () => {
    const q = { _id: 'q', type: 'multi_select', marks: 4, correctAnswer: ['A', 'C'] };
    const r = evaluation.evaluateMultiSelect(q, ['C', 'A']);
    expect(r.isCorrect).toBe(true);
    expect(r.score).toBe(4);
  });

  test('multi-select partial credit', () => {
    const q = { _id: 'q', type: 'multi_select', marks: 4, correctAnswer: ['A', 'B', 'C'] };
    const r = evaluation.evaluateMultiSelect(q, ['A', 'B']);
    expect(r.isCorrect).toBe(false);
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThan(4);
  });

  test('multi-select with wrong picks gets penalised', () => {
    const q = { _id: 'q', type: 'multi_select', marks: 4, correctAnswer: ['A', 'B'] };
    const r = evaluation.evaluateMultiSelect(q, ['A', 'X', 'Y']);
    expect(r.score).toBe(0);
  });

  test('one-line keyword match (>=50% threshold)', () => {
    const q = {
      _id: 'q',
      type: 'one_line',
      marks: 2,
      correctAnswer: 'event loop',
      keywords: ['event', 'loop', 'queue'],
    };
    const r = evaluation.evaluateOneLine(q, 'It uses an event loop and a callback queue.');
    expect(r.isCorrect).toBe(true);
    expect(r.score).toBeGreaterThan(0);
  });

  test('one-line empty answer scores zero', () => {
    const q = { _id: 'q', type: 'one_line', marks: 2, correctAnswer: 'react', keywords: ['react'] };
    const r = evaluation.evaluateOneLine(q, '');
    expect(r.score).toBe(0);
  });

  test('descriptive uses AI scoring', async () => {
    const q = { _id: 'q', type: 'descriptive', marks: 5, question: 'Explain closures', rubric: 'Mention scope and lifetime' };
    const r = await evaluation.evaluateDescriptive(q, 'Closures capture lexical scope.');
    expect(r.score).toBe(4);
    expect(r.aiProvider).toBe('gemini');
    expect(r.isCorrect).toBe(true);
  });

  test('evaluateAll aggregates totals', async () => {
    const questions = [mcq({ _id: 'q1' }), { _id: 'q2', type: 'descriptive', marks: 5, question: 'x' }];
    const answers = [
      { questionId: 'q1', answer: 'B' },
      { questionId: 'q2', answer: 'closures' },
    ];
    const r = await evaluation.evaluateAll({ questions, answers });
    expect(r.totalScore).toBe(2 + 4);
    expect(r.maxScore).toBe(7);
    expect(r.percentage).toBeCloseTo((6 / 7) * 100, 1);
    expect(r.answers).toHaveLength(2);
  });
});
