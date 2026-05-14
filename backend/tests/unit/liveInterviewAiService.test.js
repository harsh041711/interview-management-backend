jest.mock('../../src/services/aiService', () => {
  const actual = jest.requireActual('../../src/services/aiService');
  return { ...actual, askWithFallback: jest.fn() };
});

const aiService = require('../../src/services/aiService');
const svc = require('../../src/services/liveInterviewAiService');

describe('liveInterviewAiService.generateQuestions', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns parsed questions when AI succeeds', async () => {
    aiService.askWithFallback.mockResolvedValue({
      text: JSON.stringify([
        { text: 'Q1', difficulty: 'easy',   topic: 'Python' },
        { text: 'Q2', difficulty: 'medium', topic: 'Async'  },
        { text: 'Q3', difficulty: 'hard',   topic: 'Design' },
      ]),
      provider: 'gemini', model: 'gemini-2.5-flash',
    });
    const out = await svc.generateQuestions({
      candidate: { name: 'A', techStack: ['Python'], experience: 1, screening: {} },
      jdText: 'Python role',
      durationMinutes: 30,
      priorReviews: [],
    });
    expect(out.questions).toHaveLength(3);
    expect(out.questions[0].text).toBe('Q1');
    expect(out.provider).toBe('gemini');
  });

  test('returns empty list when AI returns nothing', async () => {
    aiService.askWithFallback.mockResolvedValue({ text: null });
    const out = await svc.generateQuestions({
      candidate: { techStack: [], experience: 0, screening: {} },
      jdText: '', durationMinutes: 30, priorReviews: [],
    });
    expect(out.questions).toEqual([]);
  });

  test('returns empty list when AI returns invalid JSON', async () => {
    aiService.askWithFallback.mockResolvedValue({
      text: 'sorry I cannot do that',
      provider: 'gemini', model: 'gemini-2.5-flash',
    });
    const out = await svc.generateQuestions({
      candidate: { techStack: [], experience: 0, screening: {} },
      jdText: '', durationMinutes: 30, priorReviews: [],
    });
    expect(out.questions).toEqual([]);
  });

  test('filters out questions missing required fields', async () => {
    aiService.askWithFallback.mockResolvedValue({
      text: JSON.stringify([
        { text: 'Good Q', difficulty: 'easy', topic: 'X' },
        { text: 'No diff', topic: 'Y' },
        { difficulty: 'medium' },
      ]),
      provider: 'gemini', model: 'gemini-2.5-flash',
    });
    const out = await svc.generateQuestions({
      candidate: { techStack: [], experience: 0, screening: {} },
      jdText: '', durationMinutes: 30, priorReviews: [],
    });
    expect(out.questions).toHaveLength(1);
    expect(out.questions[0].text).toBe('Good Q');
  });

  test('passes JD + candidate + prior reviews into the prompt', async () => {
    aiService.askWithFallback.mockResolvedValue({ text: null });
    await svc.generateQuestions({
      candidate: {
        name: 'Riya', techStack: ['Python', 'React'], experience: 2,
        screening: { summary: 'strong frontend', greenFlags: ['ts'], redFlags: ['backend'] },
      },
      jdText: 'Python backend role',
      durationMinutes: 45,
      priorReviews: [{ ratings: { knowledge: 3 }, comments: 'shaky on async' }],
    });
    const promptArg = aiService.askWithFallback.mock.calls[0][0];
    expect(promptArg).toContain('Python, React');
    expect(promptArg).toContain('Python backend role');
    expect(promptArg).toContain('shaky on async');
    expect(promptArg).toContain('45-minute');
  });
});
