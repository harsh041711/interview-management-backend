jest.mock('../../src/repositories/liveSessionRepository');
jest.mock('../../src/repositories/interviewRepository');
jest.mock('../../src/repositories/candidateRepository');
jest.mock('../../src/repositories/reviewRepository');
jest.mock('../../src/repositories/jobDescriptionRepository');
jest.mock('../../src/services/liveInterviewAiService');

const repo = require('../../src/repositories/liveSessionRepository');
const interviewRepo = require('../../src/repositories/interviewRepository');
const candidateRepo = require('../../src/repositories/candidateRepository');
const reviewRepo = require('../../src/repositories/reviewRepository');
const jdRepo = require('../../src/repositories/jobDescriptionRepository');
const ai = require('../../src/services/liveInterviewAiService');
const svc = require('../../src/services/liveInterviewService');

describe('liveInterviewService.start', () => {
  beforeEach(() => jest.clearAllMocks());

  const interview = {
    id: 'i1', _id: 'i1', durationMinutes: 30,
    candidate: { _id: 'c1', id: 'c1' },
    interviewer: 'iv1',
    jobDescription: 'jd1',
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
    candidateRepo.findById.mockResolvedValue({ id: 'c1', name: 'A', techStack: ['Python'], experience: 1, screening: {} });
    jdRepo.findById.mockResolvedValue({ id: 'jd1', text: 'Python role' });
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
    jdRepo.findById.mockResolvedValue(null);
    reviewRepo.findAllByCandidate.mockResolvedValue([]);
    ai.generateQuestions.mockResolvedValue({ questions: [], provider: null, model: null });
    repo.create.mockImplementation((d) => ({ ...d, id: 's3', toObject: () => ({ id: 's3', ...d }) }));

    const out = await svc.start({ interviewId: 'i1', interviewerId: 'iv1' });
    expect(out.id).toBe('s3');
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ questions: [] }));
  });
});
