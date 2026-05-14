jest.mock('../../src/repositories/liveSessionRepository');
jest.mock('../../src/repositories/interviewRepository');
jest.mock('../../src/repositories/candidateRepository');
jest.mock('../../src/repositories/reviewRepository');
jest.mock('../../src/services/liveInterviewAiService');

const repo = require('../../src/repositories/liveSessionRepository');
const interviewRepo = require('../../src/repositories/interviewRepository');
const candidateRepo = require('../../src/repositories/candidateRepository');
const reviewRepo = require('../../src/repositories/reviewRepository');
const ai = require('../../src/services/liveInterviewAiService');
const svc = require('../../src/services/liveInterviewService');

describe('liveInterviewService.start', () => {
  beforeEach(() => jest.clearAllMocks());

  const interview = {
    id: 'i1', _id: 'i1', durationMinutes: 30,
    candidate: { _id: 'c1', id: 'c1' },
    interviewer: 'iv1',
  };

  test('returns existing session if active', async () => {
    repo.findActiveByInterview.mockResolvedValue({ id: 's1', toObject: () => ({ id: 's1', questions: [] }) });
    const out = await svc.start({ interviewId: 'i1', interviewerId: 'iv1' });
    expect(out.id).toBe('s1');
    expect(ai.generateQuestions).not.toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled();
  });

  test('creates a new session with AI-generated questions if none active', async () => {
    repo.findActiveByInterview.mockResolvedValue(null);
    interviewRepo.findByIdPopulated.mockResolvedValue(interview);
    candidateRepo.findById.mockResolvedValue({
      id: 'c1', name: 'A', techStack: ['Python'], experience: 1,
      screening: { jdSnapshot: { title: 'Python role', minYears: 1, maxYears: 3 } },
    });
    reviewRepo.findAllByCandidate.mockResolvedValue([]);
    ai.generateQuestions.mockResolvedValue({
      questions: [{ text: 'Q1', difficulty: 'easy', topic: 't' }],
      provider: 'gemini', model: 'g',
    });
    repo.create.mockImplementation((d) => ({ ...d, id: 's2', toObject: () => ({ id: 's2', ...d }) }));

    const out = await svc.start({ interviewId: 'i1', interviewerId: 'iv1' });
    expect(out.id).toBe('s2');
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
      interview: 'i1', interviewer: 'iv1', candidate: 'c1',
      questions: [{ text: 'Q1', difficulty: 'easy', topic: 't' }],
    }));
  });

  test('creates a session with empty questions if AI fails', async () => {
    repo.findActiveByInterview.mockResolvedValue(null);
    interviewRepo.findByIdPopulated.mockResolvedValue(interview);
    candidateRepo.findById.mockResolvedValue({ id: 'c1', techStack: [], experience: 0, screening: {} });
    reviewRepo.findAllByCandidate.mockResolvedValue([]);
    ai.generateQuestions.mockResolvedValue({ questions: [], provider: null, model: null });
    repo.create.mockImplementation((d) => ({ ...d, id: 's3', toObject: () => ({ id: 's3', ...d }) }));

    const out = await svc.start({ interviewId: 'i1', interviewerId: 'iv1' });
    expect(out.id).toBe('s3');
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ questions: [] }));
  });
});

describe('liveInterviewService.getActive', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns active session', async () => {
    repo.findActiveByInterview.mockResolvedValue({ id: 's1', toObject: () => ({ id: 's1' }) });
    const out = await svc.getActive({ interviewId: 'i1' });
    expect(out.id).toBe('s1');
  });

  test('returns null when none', async () => {
    repo.findActiveByInterview.mockResolvedValue(null);
    const out = await svc.getActive({ interviewId: 'i1' });
    expect(out).toBeNull();
  });
});

describe('liveInterviewService.updateQuestions', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects if session not found', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(svc.updateQuestions({ sessionId: 's1', interviewerId: 'iv1', updates: [] }))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  test('rejects if interviewer does not own session', async () => {
    repo.findById.mockResolvedValue({ id: 's1', interviewer: 'other' });
    await expect(svc.updateQuestions({ sessionId: 's1', interviewerId: 'iv1', updates: [] }))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  test('rejects if session already ended', async () => {
    repo.findById.mockResolvedValue({ id: 's1', interviewer: 'iv1', endedAt: new Date() });
    await expect(svc.updateQuestions({ sessionId: 's1', interviewerId: 'iv1', updates: [] }))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  test('applies updates when owner and active', async () => {
    repo.findById.mockResolvedValue({ id: 's1', interviewer: 'iv1', endedAt: null });
    repo.applyQuestionUpdates.mockResolvedValue({ id: 's1', toObject: () => ({ id: 's1', applied: true }) });
    const out = await svc.updateQuestions({
      sessionId: 's1', interviewerId: 'iv1',
      updates: [{ index: 0, rating: 4, note: 'good' }],
    });
    expect(repo.applyQuestionUpdates).toHaveBeenCalledWith('s1', [{ index: 0, rating: 4, note: 'good' }]);
    expect(out.applied).toBe(true);
  });
});

describe('liveInterviewService.end', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects if not found', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(svc.end({ sessionId: 's1', interviewerId: 'iv1' }))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  test('returns existing draft when already ended (idempotent)', async () => {
    repo.findById.mockResolvedValue({
      id: 's1', interviewer: 'iv1', endedAt: new Date(),
      draftReview: { knowledge: 4, comments: 'x' },
      toObject() { return { id: 's1', endedAt: this.endedAt, draftReview: this.draftReview }; },
    });
    const out = await svc.end({ sessionId: 's1', interviewerId: 'iv1' });
    expect(out.draftReview.knowledge).toBe(4);
    expect(ai.generateDraftReview).not.toHaveBeenCalled();
  });

  test('generates draft, persists endedAt, returns session', async () => {
    repo.findById.mockResolvedValue({
      id: 's1', interviewer: 'iv1', endedAt: null,
      questions: [{ text: 'Q', difficulty: 'easy', askedAt: new Date(), note: 'ok', rating: 4 }],
    });
    ai.generateDraftReview.mockResolvedValue({
      draft: { knowledge: 4, communication: 4, confidence: 4, comments: 'ok', recommendation: 'hire' },
      provider: 'gemini', model: 'g',
    });
    repo.updateById.mockImplementation((id, patch) => ({
      id, ...patch, toObject() { return { id, ...patch }; },
    }));

    const out = await svc.end({ sessionId: 's1', interviewerId: 'iv1' });
    expect(repo.updateById).toHaveBeenCalledWith('s1', expect.objectContaining({
      endedAt: expect.any(Date),
      draftReview: expect.objectContaining({
        knowledge: 4, recommendation: 'hire', generatedBy: 'gemini:g',
      }),
    }));
    expect(out.draftReview.knowledge).toBe(4);
  });
});
