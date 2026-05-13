'use strict';

process.env.MONGODB_URI = 'mongodb://localhost/test';
process.env.JWT_SECRET = 'test-jwt-secret-1234567890';
process.env.TEST_TOKEN_SECRET = 'test-token-secret-abcdefghij';
process.env.INTERVIEW_TOKEN_SECRET = 'test-interview-token-secret-xyz';
process.env.FRONTEND_URL = 'http://localhost:5173';

jest.mock('../../src/repositories/candidateRepository');
jest.mock('../../src/services/emailService', () => ({
  sendResumeShortlisted: jest.fn(),
  sendResumeDeclined: jest.fn(),
  sendCandidateInvite: jest.fn(),
}));
jest.mock('../../src/services/jobDescriptionService', () => ({
  lookup: jest.fn(),
}));
jest.mock('../../src/services/resumeScreeningService', () => ({
  score: jest.fn(),
  extractResumeText: jest.fn(),
}));

const candidateService = require('../../src/services/candidateService');
const candidateRepo = require('../../src/repositories/candidateRepository');
const emailService = require('../../src/services/emailService');
const { CANDIDATE_STATUS } = require('../../src/utils/constants');

const makeCandidate = (overrides = {}) => ({
  id: 'c1',
  name: 'Alice',
  email: 'alice@example.com',
  techStack: ['react'],
  experience: 'senior',
  status: CANDIDATE_STATUS.RESUME_PENDING,
  testToken: 'tok',
  tokenExpiresAt: new Date(Date.now() + 3600000),
  resumeUrl: 'https://cloudinary/test.pdf',
  save: jest.fn().mockResolvedValue(),
  ...overrides,
});

describe('candidateService.approveResume', () => {
  beforeEach(() => jest.clearAllMocks());

  test('flips status to resume_approved and fires shortlist email', async () => {
    const candidate = makeCandidate();
    candidateRepo.findById.mockResolvedValue(candidate);
    await candidateService.approveResume('c1');
    expect(candidate.status).toBe(CANDIDATE_STATUS.RESUME_APPROVED);
    expect(candidate.save).toHaveBeenCalled();
    // setImmediate fires the email
    await new Promise((r) => setImmediate(r));
    expect(emailService.sendResumeShortlisted).toHaveBeenCalled();
  });

  test('rejects with E_ALREADY_DECIDED when status is not resume_pending', async () => {
    const candidate = makeCandidate({ status: CANDIDATE_STATUS.RESUME_APPROVED });
    candidateRepo.findById.mockResolvedValue(candidate);
    await expect(candidateService.approveResume('c1')).rejects.toMatchObject({
      code: 'E_ALREADY_DECIDED',
    });
  });

  test('404 when candidate not found', async () => {
    candidateRepo.findById.mockResolvedValue(null);
    await expect(candidateService.approveResume('c1')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('candidateService.declineResume', () => {
  beforeEach(() => jest.clearAllMocks());

  test('flips status to resume_declined and fires rejection email', async () => {
    const candidate = makeCandidate();
    candidateRepo.findById.mockResolvedValue(candidate);
    await candidateService.declineResume('c1');
    expect(candidate.status).toBe(CANDIDATE_STATUS.RESUME_DECLINED);
    expect(candidate.save).toHaveBeenCalled();
    await new Promise((r) => setImmediate(r));
    expect(emailService.sendResumeDeclined).toHaveBeenCalled();
  });

  test('rejects with E_ALREADY_DECIDED when status is not resume_pending', async () => {
    const candidate = makeCandidate({ status: CANDIDATE_STATUS.RESUME_DECLINED });
    candidateRepo.findById.mockResolvedValue(candidate);
    await expect(candidateService.declineResume('c1')).rejects.toMatchObject({
      code: 'E_ALREADY_DECIDED',
    });
  });
});

describe('candidateService.sendTest', () => {
  beforeEach(() => jest.clearAllMocks());

  test('flips status to pending and fires invite email', async () => {
    const candidate = makeCandidate({ status: CANDIDATE_STATUS.RESUME_APPROVED });
    candidateRepo.findById.mockResolvedValue(candidate);
    await candidateService.sendTest('c1');
    expect(candidate.status).toBe(CANDIDATE_STATUS.PENDING);
    expect(candidate.save).toHaveBeenCalled();
    await new Promise((r) => setImmediate(r));
    expect(emailService.sendCandidateInvite).toHaveBeenCalled();
  });

  test('regenerates token + expiration so the candidate gets a fresh window', async () => {
    const candidate = makeCandidate({
      status: CANDIDATE_STATUS.RESUME_APPROVED,
      testToken: 'stale-token',
      tokenExpiresAt: new Date('2020-01-01T00:00:00Z'),
    });
    candidateRepo.findById.mockResolvedValue(candidate);
    await candidateService.sendTest('c1');
    expect(candidate.testToken).not.toBe('stale-token');
    expect(candidate.tokenExpiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  test('rejects with E_NOT_APPROVED when status is not resume_approved', async () => {
    const candidate = makeCandidate({ status: CANDIDATE_STATUS.RESUME_PENDING });
    candidateRepo.findById.mockResolvedValue(candidate);
    await expect(candidateService.sendTest('c1')).rejects.toMatchObject({
      code: 'E_NOT_APPROVED',
    });
  });
});

describe('candidateService.rescreen', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects with E_NOT_RESCREENABLE when status past resume_approved', async () => {
    const candidate = makeCandidate({ status: CANDIDATE_STATUS.PENDING });
    candidateRepo.findById.mockResolvedValue(candidate);
    await expect(candidateService.rescreen('c1')).rejects.toMatchObject({
      code: 'E_NOT_RESCREENABLE',
    });
  });

  test('rejects with E_NO_RESUME when no resume url', async () => {
    const candidate = makeCandidate({ resumeUrl: null });
    candidateRepo.findById.mockResolvedValue(candidate);
    await expect(candidateService.rescreen('c1')).rejects.toMatchObject({ code: 'E_NO_RESUME' });
  });
});
