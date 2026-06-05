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

describe('liveInterviewAiService.generateDraftReview', () => {
  beforeEach(() => jest.clearAllMocks());

  const askedQuestions = [
    { text: 'Q1', difficulty: 'easy',   topic: 'A', askedAt: new Date(), note: 'confident', rating: 4 },
    { text: 'Q2', difficulty: 'medium', topic: 'B', askedAt: new Date(), note: 'hesitant',  rating: 3 },
    { text: 'Q3', difficulty: 'hard',   topic: 'C', askedAt: null,       note: '',          rating: null },
  ];

  test('returns parsed draft when AI succeeds', async () => {
    aiService.askWithFallback.mockResolvedValue({
      text: JSON.stringify({
        knowledge: 4, communication: 3, confidence: 4,
        comments: 'Strong on basics, hesitant on hard. Recommend next round.',
        recommendation: 'next_round',
      }),
      provider: 'gemini', model: 'gemini-2.5-flash',
    });
    const out = await svc.generateDraftReview({ questions: askedQuestions });
    expect(out.draft.knowledge).toBe(4);
    expect(out.draft.recommendation).toBe('next_round');
    expect(out.provider).toBe('gemini');
  });

  test('returns fallback draft when AI fails', async () => {
    aiService.askWithFallback.mockResolvedValue({ text: null });
    const out = await svc.generateDraftReview({ questions: askedQuestions });
    expect(out.draft.knowledge).toBeNull();
    expect(out.draft.communication).toBeNull();
    expect(out.draft.confidence).toBeNull();
    expect(out.draft.comments).toContain('confident');
    expect(out.draft.comments).toContain('hesitant');
    expect(out.draft.recommendation).toBeNull();
  });

  test('clamps ratings to 1-5 and rejects invalid recommendation', async () => {
    aiService.askWithFallback.mockResolvedValue({
      text: JSON.stringify({
        knowledge: 7, communication: 0, confidence: 3,
        comments: 'ok', recommendation: 'maybe',
      }),
      provider: 'gemini', model: 'g',
    });
    const out = await svc.generateDraftReview({ questions: askedQuestions });
    expect(out.draft.knowledge).toBe(5);
    expect(out.draft.communication).toBe(1);
    expect(out.draft.confidence).toBe(3);
    expect(out.draft.recommendation).toBeNull();
  });

  test('only sends asked questions to the AI', async () => {
    aiService.askWithFallback.mockResolvedValue({ text: null });
    await svc.generateDraftReview({ questions: askedQuestions });
    const promptArg = aiService.askWithFallback.mock.calls[0][0];
    expect(promptArg).toContain('Q1');
    expect(promptArg).toContain('Q2');
    expect(promptArg).not.toContain('Q3');
  });
});

describe('liveInterviewAiService.suggestFollowUps', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns up to 3 suggestions on AI success', async () => {
    aiService.askWithFallback.mockResolvedValue({
      text: JSON.stringify({
        suggestions: ['Q1?', 'Q2?', 'Q3?', 'Q4?'],
      }),
      provider: 'gemini', model: 'gemini-2.5-flash',
    });
    const out = await svc.suggestFollowUps({
      questionText: 'Tell me about Redux.',
      note: 'they use it mostly for forms',
      topic: 'React',
      difficulty: 'medium',
    });
    expect(out.suggestions).toEqual(['Q1?', 'Q2?', 'Q3?']);
    expect(out.provider).toBe('gemini');
  });

  test('drops empty / whitespace suggestions', async () => {
    aiService.askWithFallback.mockResolvedValue({
      text: JSON.stringify({ suggestions: ['Q1?', '   ', '', 'Q2?'] }),
      provider: 'gemini', model: 'gemini-2.5-flash',
    });
    const out = await svc.suggestFollowUps({
      questionText: 'Q', note: 'n',
    });
    expect(out.suggestions).toEqual(['Q1?', 'Q2?']);
  });

  test('throws 503 E_AI_FAILED when AI returns no text', async () => {
    aiService.askWithFallback.mockResolvedValue({
      text: null, provider: null, model: null,
    });
    await expect(svc.suggestFollowUps({
      questionText: 'Q', note: 'n',
    })).rejects.toMatchObject({ statusCode: 503, code: 'E_AI_FAILED' });
  });

  test('throws 503 E_AI_PARSE when JSON is invalid shape (no suggestions array)', async () => {
    aiService.askWithFallback.mockResolvedValue({
      text: JSON.stringify({ unexpected: 'shape' }),
      provider: 'gemini', model: 'gemini-2.5-flash',
    });
    await expect(svc.suggestFollowUps({
      questionText: 'Q', note: 'n',
    })).rejects.toMatchObject({ statusCode: 503, code: 'E_AI_PARSE' });
  });

  test('throws 503 E_AI_PARSE when AI returns unparseable text', async () => {
    aiService.askWithFallback.mockResolvedValue({
      text: 'not json at all',
      provider: 'gemini', model: 'gemini-2.5-flash',
    });
    await expect(svc.suggestFollowUps({
      questionText: 'Q', note: 'n',
    })).rejects.toMatchObject({ statusCode: 503, code: 'E_AI_PARSE' });
  });
});
