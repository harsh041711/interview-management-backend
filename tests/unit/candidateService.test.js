'use strict';

process.env.MONGODB_URI = 'mongodb://localhost/test';
process.env.JWT_SECRET = 'test-jwt-secret-1234567890';
process.env.TEST_TOKEN_SECRET = 'test-token-secret-abcdefghij';
process.env.INTERVIEW_TOKEN_SECRET = 'test-interview-token-secret-xyz';
process.env.FRONTEND_URL = 'http://localhost:5173';

// ---------------------------------------------------------------------------
// Mock all repositories so no DB is needed
// ---------------------------------------------------------------------------

jest.mock('../../src/repositories/candidateRepository');
jest.mock('../../src/repositories/submissionRepository');
jest.mock('../../src/repositories/interviewRepository');
jest.mock('../../src/repositories/reviewRepository');
jest.mock('../../src/repositories/rescheduleRequestRepository');
jest.mock('../../src/repositories/liveSessionRepository');

// Mock services that have side-effects or external I/O
jest.mock('../../src/services/emailService', () => ({
  sendCandidateInvite: jest.fn().mockResolvedValue({}),
  sendRound1Result: jest.fn().mockResolvedValue({}),
  sendCultureFitInvite: jest.fn().mockResolvedValue({}),
  sendFinalRejection: jest.fn().mockResolvedValue({}),
  sendResumeShortlisted: jest.fn().mockResolvedValue({}),
  sendResumeDeclined: jest.fn().mockResolvedValue({}),
  sendCodingTestInvite: jest.fn().mockResolvedValue({}),
  getTransporter: jest.fn().mockReturnValue(null),
}));
jest.mock('../../src/services/uploadService', () => ({
  destroyAsset: jest.fn().mockResolvedValue({}),
  uploadBufferToCloudinary: jest.fn().mockResolvedValue({ url: 'https://cdn/file.pdf', publicId: 'file_123' }),
}));
jest.mock('../../src/services/codingProblemService', () => ({
  detail: jest.fn(),
  sampleForCandidate: jest.fn(),
}));
jest.mock('../../src/services/jobDescriptionService', () => ({
  lookup: jest.fn().mockResolvedValue(null),
  detail: jest.fn(),
  tokenize: jest.fn(),
  findBestMatch: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../src/services/resumeScreeningService', () => ({
  extractResumeText: jest.fn().mockResolvedValue('resume text'),
  score: jest.fn().mockResolvedValue({ status: 'scored', matchPercent: 80 }),
}));

const candidateRepository = require('../../src/repositories/candidateRepository');
const submissionRepository = require('../../src/repositories/submissionRepository');
const interviewRepository = require('../../src/repositories/interviewRepository');
const reviewRepository = require('../../src/repositories/reviewRepository');
const liveSessionRepository = require('../../src/repositories/liveSessionRepository');

const svc = require('../../src/services/candidateService');

// ---------------------------------------------------------------------------
// candidateService.detail — multi-round timeline payload
// ---------------------------------------------------------------------------

describe('candidateService.detail — multi-round timeline payload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    candidateRepository.findById = jest.fn();
    submissionRepository.findByCandidate = jest.fn().mockResolvedValue(null);
    interviewRepository.list = jest.fn();
    reviewRepository.findAllByCandidate = jest.fn();
    liveSessionRepository.findLatestByInterview = jest.fn();
  });

  test('returns interviews sorted by round asc with stripped fields', async () => {
    const candidate = {
      id: 'c1', _id: 'c1', name: 'Jane Doe', email: 'j@e.com',
      techStack: ['react'], experience: 'mid', status: 'awaiting_decision',
    };
    candidateRepository.findById.mockResolvedValue(candidate);

    const ivR2 = {
      _id: 'iv2', id: 'iv2', round: 2, roundType: 'practical', status: 'scheduled',
      scheduledAt: new Date('2026-05-16T10:00:00Z'), completedAt: null, durationMinutes: 45,
      interviewer: { _id: 'i2', id: 'i2', name: 'Sarah L.' }, notes: null,
    };
    const ivR1 = {
      _id: 'iv1', id: 'iv1', round: 1, roundType: 'technical', status: 'completed',
      scheduledAt: new Date('2026-05-12T10:00:00Z'),
      completedAt: new Date('2026-05-12T10:45:00Z'), durationMinutes: 45,
      interviewer: { _id: 'i1', id: 'i1', name: 'John D.' }, notes: 'kickoff',
    };
    interviewRepository.list.mockResolvedValue({ items: [ivR2, ivR1] });
    reviewRepository.findAllByCandidate.mockResolvedValue([]);
    liveSessionRepository.findLatestByInterview.mockResolvedValue(null);

    const out = await svc.detail('c1');

    expect(out.interviews).toHaveLength(2);
    expect(out.interviews[0].round).toBe(1);
    expect(out.interviews[1].round).toBe(2);
    expect(out.interviews[0].interviewer).toEqual({ id: 'i1', name: 'John D.' });
    expect(out.interviews[0].copilotQuestions).toEqual([]);
  });

  test('includes copilot questions per interview when a session exists', async () => {
    candidateRepository.findById.mockResolvedValue({ id: 'c1', _id: 'c1', name: 'X', email: 'x@e.com' });
    interviewRepository.list.mockResolvedValue({ items: [
      { _id: 'iv1', id: 'iv1', round: 1, roundType: 'technical', status: 'completed',
        scheduledAt: new Date(), durationMinutes: 45,
        interviewer: { _id: 'i1', id: 'i1', name: 'John' } },
    ] });
    reviewRepository.findAllByCandidate.mockResolvedValue([]);
    liveSessionRepository.findLatestByInterview.mockResolvedValue({
      questions: [
        { text: 'Explain useEffect', topic: 'React', difficulty: 'medium', askedAt: new Date(), rating: 4, note: 'good' },
      ],
    });

    const out = await svc.detail('c1');

    expect(out.interviews[0].copilotQuestions).toHaveLength(1);
    expect(out.interviews[0].copilotQuestions[0].text).toBe('Explain useEffect');
  });

  test('returns reviews array from reviewRepository.findAllByCandidate', async () => {
    candidateRepository.findById.mockResolvedValue({ id: 'c1', _id: 'c1', name: 'X', email: 'x@e.com' });
    interviewRepository.list.mockResolvedValue({ items: [] });
    reviewRepository.findAllByCandidate.mockResolvedValue([
      { _id: 'r1', interview: 'iv1', ratings: { knowledge: 4, communication: 5, confidence: 4 }, comments: 'OK', submittedAt: new Date() },
    ]);
    liveSessionRepository.findLatestByInterview.mockResolvedValue(null);

    const out = await svc.detail('c1');

    expect(out.reviews).toHaveLength(1);
    expect(out.reviews[0].interview).toBe('iv1');
  });

  test('empty arrays when no interviews / reviews exist', async () => {
    candidateRepository.findById.mockResolvedValue({ id: 'c1', _id: 'c1', name: 'X', email: 'x@e.com' });
    interviewRepository.list.mockResolvedValue({ items: [] });
    reviewRepository.findAllByCandidate.mockResolvedValue([]);

    const out = await svc.detail('c1');

    expect(out.interviews).toEqual([]);
    expect(out.reviews).toEqual([]);
    // liveSessionRepository is not called when there are no interviews
    expect(liveSessionRepository.findLatestByInterview).not.toHaveBeenCalled();
  });

  test('preserves existing candidate and submission fields (backwards compat)', async () => {
    candidateRepository.findById.mockResolvedValue({ id: 'c1', _id: 'c1', name: 'X', email: 'x@e.com' });
    submissionRepository.findByCandidate.mockResolvedValue({ score: 80, outcome: 'shortlisted' });
    interviewRepository.list.mockResolvedValue({ items: [] });
    reviewRepository.findAllByCandidate.mockResolvedValue([]);

    const out = await svc.detail('c1');

    expect(out.candidate).toBeDefined();
    expect(out.candidate.id).toBe('c1');
    expect(out.submission).toEqual({ score: 80, outcome: 'shortlisted' });
  });
});

describe('candidateService.sendCodingTest — MCQ-cleared gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    candidateRepository.findById = jest.fn();
  });

  const baseCandidate = (status, overrides = {}) => ({
    id: 'c1',
    _id: 'c1',
    status,
    techStack: ['react'],
    codingTest: undefined,
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  });

  test('rejects with E_MCQ_NOT_CLEARED when status is resume_approved', async () => {
    candidateRepository.findById.mockResolvedValue(baseCandidate('resume_approved'));
    await expect(svc.sendCodingTest('c1', {}, 'admin1'))
      .rejects.toMatchObject({ statusCode: 409, code: 'E_MCQ_NOT_CLEARED' });
  });

  test('rejects with E_MCQ_NOT_CLEARED when status is in_progress', async () => {
    candidateRepository.findById.mockResolvedValue(baseCandidate('in_progress'));
    await expect(svc.sendCodingTest('c1', {}, 'admin1'))
      .rejects.toMatchObject({ statusCode: 409, code: 'E_MCQ_NOT_CLEARED' });
  });

  test('rejects with E_MCQ_NOT_CLEARED when status is completed (MCQ submitted but not graded)', async () => {
    candidateRepository.findById.mockResolvedValue(baseCandidate('completed'));
    await expect(svc.sendCodingTest('c1', {}, 'admin1'))
      .rejects.toMatchObject({ statusCode: 409, code: 'E_MCQ_NOT_CLEARED' });
  });

  test('rejects with E_MCQ_NOT_CLEARED when status is rejected', async () => {
    candidateRepository.findById.mockResolvedValue(baseCandidate('rejected'));
    await expect(svc.sendCodingTest('c1', {}, 'admin1'))
      .rejects.toMatchObject({ statusCode: 409, code: 'E_MCQ_NOT_CLEARED' });
  });

  test('rejects with E_MCQ_NOT_CLEARED when status is cheated', async () => {
    candidateRepository.findById.mockResolvedValue(baseCandidate('cheated'));
    await expect(svc.sendCodingTest('c1', {}, 'admin1'))
      .rejects.toMatchObject({ statusCode: 409, code: 'E_MCQ_NOT_CLEARED' });
  });

  test('allows when status is shortlisted', async () => {
    const codingProblemService = require('../../src/services/codingProblemService');
    codingProblemService.sampleForCandidate.mockResolvedValue([
      { id: 'p1', title: 'Problem 1', difficulty: 'medium', supportedLanguages: ['js'] },
    ]);
    candidateRepository.findById.mockResolvedValue(baseCandidate('shortlisted'));
    const out = await svc.sendCodingTest('c1', { problemCount: 1, difficulty: 'medium' }, 'admin1');
    expect(out).toBeDefined();
  });

  test('allows when status is awaiting_decision (re-send after later progression)', async () => {
    const codingProblemService = require('../../src/services/codingProblemService');
    codingProblemService.sampleForCandidate.mockResolvedValue([
      { id: 'p1', title: 'Problem 1', difficulty: 'medium', supportedLanguages: ['js'] },
    ]);
    candidateRepository.findById.mockResolvedValue(baseCandidate('awaiting_decision'));
    const out = await svc.sendCodingTest('c1', { problemCount: 1, difficulty: 'medium' }, 'admin1');
    expect(out).toBeDefined();
  });

  test('allows when status is selected_for_culture', async () => {
    const codingProblemService = require('../../src/services/codingProblemService');
    codingProblemService.sampleForCandidate.mockResolvedValue([
      { id: 'p1', title: 'Problem 1', difficulty: 'medium', supportedLanguages: ['js'] },
    ]);
    candidateRepository.findById.mockResolvedValue(baseCandidate('selected_for_culture'));
    const out = await svc.sendCodingTest('c1', { problemCount: 1, difficulty: 'medium' }, 'admin1');
    expect(out).toBeDefined();
  });
});

describe('candidateService.createCandidate (JD-driven)', () => {
  const candidateService = require('../../src/services/candidateService');
  const candidateRepository = require('../../src/repositories/candidateRepository');
  const jdService = require('../../src/services/jobDescriptionService');

  beforeEach(() => jest.clearAllMocks());

  test('derives techStack and experience from the selected JD', async () => {
    jdService.detail.mockResolvedValue({
      id: 'jd1', techStack: 'react,node,mongodb', experience: 'senior',
    });
    jdService.tokenize.mockReturnValue(['react', 'node', 'mongodb']);
    candidateRepository.create.mockImplementation(async (doc) => ({
      id: 'c1', ...doc,
      screening: {},
    }));

    const result = await candidateService.createCandidate(
      { name: 'Jane Doe', email: 'jane@example.com', jobDescriptionId: 'jd1' },
      'admin1',
    );

    expect(jdService.detail).toHaveBeenCalledWith('jd1');
    expect(jdService.tokenize).toHaveBeenCalledWith('react,node,mongodb');
    expect(candidateRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Jane Doe',
      email: 'jane@example.com',
      jobDescriptionId: 'jd1',
      techStack: ['react', 'node', 'mongodb'],
      experience: 'senior',
      createdBy: 'admin1',
    }));
    expect(result.id).toBe('c1');
  });

  test('propagates 404 when the JD is not found', async () => {
    const ApiError = require('../../src/utils/ApiError');
    jdService.detail.mockRejectedValue(ApiError.notFound('JD not found'));
    await expect(candidateService.createCandidate(
      { name: 'Jane', email: 'jane@example.com', jobDescriptionId: 'missing' },
      'admin1',
    )).rejects.toMatchObject({ statusCode: 404 });
    expect(candidateRepository.create).not.toHaveBeenCalled();
  });
});

describe('candidateService.runScreeningFor (linked JD)', () => {
  const candidateService = require('../../src/services/candidateService');
  const jdService = require('../../src/services/jobDescriptionService');
  const resumeScreeningService = require('../../src/services/resumeScreeningService');

  beforeEach(() => jest.clearAllMocks());

  test('screens against the linked JD when jobDescriptionId is set', async () => {
    jdService.detail.mockResolvedValue({ id: 'jd1', title: 'Sr MERN', techStack: 'react,node' });
    resumeScreeningService.extractResumeText.mockResolvedValue('resume text');
    resumeScreeningService.score.mockResolvedValue({ status: 'scored', matchPercent: 80 });

    const candidate = {
      jobDescriptionId: 'jd1',
      techStack: ['react', 'node'],
      experience: 'senior',
      resumeUrl: 'http://x/resume.pdf',
      resumeMimeType: 'application/pdf',
      save: jest.fn().mockResolvedValue(undefined),
    };

    await candidateService.runScreeningFor(candidate, { buffer: Buffer.from('x') });

    expect(jdService.detail).toHaveBeenCalledWith('jd1');
    expect(jdService.findBestMatch).not.toHaveBeenCalled();
    expect(resumeScreeningService.score).toHaveBeenCalledWith(
      expect.objectContaining({ jd: expect.objectContaining({ id: 'jd1' }) }),
    );
    expect(candidate.save).toHaveBeenCalled();
  });

  test('falls back to findBestMatch when no jobDescriptionId', async () => {
    jdService.findBestMatch.mockResolvedValue({ id: 'jd9', title: 'React', techStack: 'react' });
    resumeScreeningService.extractResumeText.mockResolvedValue('resume text');
    resumeScreeningService.score.mockResolvedValue({ status: 'scored', matchPercent: 70 });

    const candidate = {
      jobDescriptionId: null,
      techStack: ['react'],
      experience: 'mid',
      resumeUrl: 'http://x/resume.pdf',
      resumeMimeType: 'application/pdf',
      save: jest.fn().mockResolvedValue(undefined),
    };

    await candidateService.runScreeningFor(candidate, { buffer: Buffer.from('x') });

    expect(jdService.detail).not.toHaveBeenCalled();
    expect(jdService.findBestMatch).toHaveBeenCalledWith(['react'], 'mid');
    expect(candidate.save).toHaveBeenCalled();
  });

  test('falls back to findBestMatch when the linked JD lookup fails', async () => {
    jdService.detail.mockRejectedValue(Object.assign(new Error('DB timeout'), { statusCode: 500 }));
    jdService.findBestMatch.mockResolvedValue({ id: 'jd9', title: 'React', techStack: 'react' });
    resumeScreeningService.extractResumeText.mockResolvedValue('resume text');
    resumeScreeningService.score.mockResolvedValue({ status: 'scored', matchPercent: 65 });

    const candidate = {
      jobDescriptionId: 'jd-broken',
      techStack: ['react'],
      experience: 'mid',
      resumeUrl: 'http://x/resume.pdf',
      resumeMimeType: 'application/pdf',
      save: jest.fn().mockResolvedValue(undefined),
    };

    await candidateService.runScreeningFor(candidate, { buffer: Buffer.from('x') });

    expect(jdService.detail).toHaveBeenCalledWith('jd-broken');
    expect(jdService.findBestMatch).toHaveBeenCalledWith(['react'], 'mid');
    expect(candidate.save).toHaveBeenCalled();
  });
});

describe('candidateService.sendTest (config overrides)', () => {
  const candidateService = require('../../src/services/candidateService');
  const candidateRepository = require('../../src/repositories/candidateRepository');

  beforeEach(() => jest.clearAllMocks());

  test('persists questionCount, durationMinutes and techStack before issuing the invite', async () => {
    const candidate = {
      id: 'c1',
      status: 'resume_approved',
      techStack: ['react'],
      questionCount: 10,
      durationMinutes: 12,
      save: jest.fn().mockResolvedValue(undefined),
    };
    candidateRepository.findById.mockResolvedValue(candidate);

    await candidateService.sendTest('c1', {
      questionCount: 20,
      durationMinutes: 30,
      techStack: ['react', 'node'],
    });

    expect(candidate.questionCount).toBe(20);
    expect(candidate.durationMinutes).toBe(30);
    expect(candidate.techStack).toEqual(['react', 'node']);
    expect(candidate.status).toBe('pending');
    expect(candidate.save).toHaveBeenCalled();
  });

  test('keeps existing values when no overrides are passed', async () => {
    const candidate = {
      id: 'c1',
      status: 'resume_approved',
      techStack: ['react'],
      questionCount: 10,
      durationMinutes: 12,
      save: jest.fn().mockResolvedValue(undefined),
    };
    candidateRepository.findById.mockResolvedValue(candidate);

    await candidateService.sendTest('c1');

    expect(candidate.questionCount).toBe(10);
    expect(candidate.durationMinutes).toBe(12);
    expect(candidate.techStack).toEqual(['react']);
  });
});
