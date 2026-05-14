const aiService = require('../../src/services/aiService');
jest.mock('../../src/services/aiService');

const svc = require('../../src/services/promptProblemAiService');

describe('promptProblemAiService.generatePersonalizedPromptProblem', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns parsed JSON when AI succeeds', async () => {
    aiService.askWithFallback.mockResolvedValue({
      text: JSON.stringify({
        title: 'T', description: 'D', sampleInput: 'I',
        expectedOutputCriteria: ['c1'], customRubricCriteria: ['r1'],
        difficulty: 'medium', tags: ['x'], durationMinutes: 20,
      }),
      provider: 'gemini', model: 'gemini-2.5-flash',
    });
    const candidate = {
      name: 'A', techStack: ['Node'], experience: 'mid',
      screening: { summary: 's', greenFlags: [], redFlags: [], resumeText: 'r' },
    };
    const out = await svc.generatePersonalizedPromptProblem({ candidate });
    expect(out.title).toBe('T');
    expect(out.expectedOutputCriteria).toEqual(['c1']);
    expect(out._provider).toBe('gemini');
  });

  test('returns null when AI returns nothing', async () => {
    aiService.askWithFallback.mockResolvedValue({ text: null });
    const out = await svc.generatePersonalizedPromptProblem({
      candidate: { techStack: ['x'], experience: 'mid', screening: {} },
    });
    expect(out).toBeNull();
  });

  test('strips markdown fences before parsing', async () => {
    aiService.askWithFallback.mockResolvedValue({
      text: '```json\n{"title":"T","description":"D","sampleInput":"I","expectedOutputCriteria":["c"],"difficulty":"easy","tags":[],"durationMinutes":15}\n```',
      provider: 'groq', model: 'llama',
    });
    const out = await svc.generatePersonalizedPromptProblem({
      candidate: { techStack: ['x'], experience: 'entry', screening: {} },
    });
    expect(out.title).toBe('T');
  });

  test('passes candidate context into the AI prompt', async () => {
    aiService.askWithFallback.mockResolvedValue({ text: null });
    await svc.generatePersonalizedPromptProblem({
      candidate: {
        techStack: ['Node', 'React'], experience: 'senior',
        screening: { summary: 'strong full-stack', greenFlags: ['arch'], redFlags: ['tests'], resumeText: 'Built X' },
      },
    });
    const promptArg = aiService.askWithFallback.mock.calls[0][0];
    expect(promptArg).toContain('Node, React');
    expect(promptArg).toContain('senior');
    expect(promptArg).toContain('strong full-stack');
  });
});
