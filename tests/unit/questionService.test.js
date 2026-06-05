'use strict';

process.env.MONGODB_URI = 'mongodb://localhost/test';
process.env.JWT_SECRET = 'test-jwt-secret-1234567890';
process.env.TEST_TOKEN_SECRET = 'test-token-secret-abcdefghij';
process.env.INTERVIEW_TOKEN_SECRET = 'test-interview-token-secret-xyz';
process.env.FRONTEND_URL = 'http://localhost:5173';

jest.mock('../../src/repositories/questionRepository');
jest.mock('../../src/services/aiService');

const questionService = require('../../src/services/questionService');
const questionRepository = require('../../src/repositories/questionRepository');
const aiService = require('../../src/services/aiService');

const mixQuestions = () => [
  { techStack: 'react', type: 'mcq', question: 'Q1', options: ['a', 'b', 'c', 'd'], correctAnswer: 'a', marks: 2, difficulty: 'easy' },
  { techStack: 'react', type: 'multi_select', question: 'Q2', options: ['a', 'b', 'c', 'd'], correctAnswer: ['a', 'b'], marks: 3, difficulty: 'medium' },
  { techStack: 'react', type: 'one_line', question: 'Q3', correctAnswer: 'answer', keywords: ['x'], marks: 1, difficulty: 'easy' },
  { techStack: 'react', type: 'descriptive', question: 'Q4', rubric: 'covers x', marks: 4, difficulty: 'hard' },
];

describe('questionService.generateAndSave — type filtering', () => {
  beforeEach(() => jest.clearAllMocks());

  test('saves ONLY the requested types when the AI returns a mix', async () => {
    aiService.generateQuestions.mockResolvedValue({
      provider: 'gemini', model: 'gemini-2.5-flash', questions: mixQuestions(),
    });
    questionRepository.insertMany.mockImplementation(async (docs) => docs.map((d, i) => ({ id: `q${i}`, ...d })));

    await questionService.generateAndSave(
      { techStack: 'react', count: 10, types: ['mcq', 'multi_select'], persist: true },
      'admin1',
    );

    const savedTypes = questionRepository.insertMany.mock.calls[0][0].map((d) => d.type);
    expect(savedTypes).toEqual(['mcq', 'multi_select']);
    expect(savedTypes).not.toContain('one_line');
    expect(savedTypes).not.toContain('descriptive');
  });

  test('keeps all valid types when no types are requested (mix mode)', async () => {
    aiService.generateQuestions.mockResolvedValue({
      provider: 'gemini', model: 'm',
      questions: [mixQuestions()[0], mixQuestions()[2]], // mcq + one_line
    });
    questionRepository.insertMany.mockImplementation(async (docs) => docs);

    await questionService.generateAndSave({ techStack: 'react', count: 10, persist: true }, 'admin1');

    const savedTypes = questionRepository.insertMany.mock.calls[0][0].map((d) => d.type);
    expect(savedTypes).toEqual(['mcq', 'one_line']);
  });
});
