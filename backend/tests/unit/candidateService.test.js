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
