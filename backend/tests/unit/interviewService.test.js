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
jest.mock('../../src/repositories/interviewerRepository');
jest.mock('../../src/repositories/interviewRepository');
jest.mock('../../src/repositories/rescheduleRequestRepository');
jest.mock('../../src/repositories/adminRepository');

// Mock email service — all send functions are no-ops
jest.mock('../../src/services/emailService', () => ({
  sendInterviewScheduled: jest.fn().mockResolvedValue({}),
  sendRescheduleRequested: jest.fn().mockResolvedValue({}),
  sendRescheduleApproved: jest.fn().mockResolvedValue({}),
  sendRescheduleRejected: jest.fn().mockResolvedValue({}),
  getTransporter: jest.fn().mockReturnValue(null),
}));

const candidateRepository = require('../../src/repositories/candidateRepository');
const interviewerRepository = require('../../src/repositories/interviewerRepository');
const interviewRepository = require('../../src/repositories/interviewRepository');
const rescheduleRequestRepository = require('../../src/repositories/rescheduleRequestRepository');

const interviewService = require('../../src/services/interviewService');
const { INTERVIEW_STATUS, RESCHEDULE_STATUS, CANDIDATE_STATUS } = require('../../src/utils/constants');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeCandidate = (overrides = {}) => ({
  _id: 'cand001',
  id: 'cand001',
  name: 'Alice',
  email: 'alice@example.com',
  status: CANDIDATE_STATUS.SHORTLISTED,
  techStack: ['Node.js'],
  ...overrides,
});

const makeInterviewer = (overrides = {}) => ({
  _id: 'ivwr001',
  id: 'ivwr001',
  name: 'Bob',
  email: 'bob@example.com',
  isActive: true,
  expertise: ['Node.js'],
  ...overrides,
});

const makeInterview = (overrides = {}) => {
  const doc = {
    _id: 'intv001',
    id: 'intv001',
    candidate: makeCandidate(),
    interviewer: makeInterviewer(),
    scheduledAt: new Date(Date.now() + 86400_000),
    durationMinutes: 45,
    meetingUrl: 'https://meet.example.com/room1',
    candidateAccessToken: 'tok_cand.abc123',
    interviewerAccessToken: 'tok_ivwr.def456',
    status: INTERVIEW_STATUS.SCHEDULED,
    scheduledBy: 'admin001',
    completedAt: null,
    completionNote: null,
    cancelledAt: null,
    cancelReason: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    save: jest.fn().mockResolvedValue(undefined),
    toObject: function () { return { ...this }; },
    ...overrides,
  };
  return doc;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('interviewService.schedule', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects when candidate is not shortlisted (E_NOT_SHORTLISTED)', async () => {
    candidateRepository.findById.mockResolvedValue(
      makeCandidate({ status: CANDIDATE_STATUS.PENDING }),
    );

    await expect(
      interviewService.schedule(
        {
          candidateId: 'cand001',
          interviewerId: 'ivwr001',
          scheduledAt: new Date(Date.now() + 86400_000),
          meetingUrl: 'https://meet.example.com/r',
        },
        'admin001',
      ),
    ).rejects.toMatchObject({ code: 'E_NOT_SHORTLISTED', statusCode: 409 });
  });

  test('rejects when interviewer is inactive (E_INTERVIEWER_INACTIVE)', async () => {
    candidateRepository.findById.mockResolvedValue(makeCandidate());
    interviewerRepository.findById.mockResolvedValue(makeInterviewer({ isActive: false }));

    await expect(
      interviewService.schedule(
        {
          candidateId: 'cand001',
          interviewerId: 'ivwr001',
          scheduledAt: new Date(Date.now() + 86400_000),
          meetingUrl: 'https://meet.example.com/r',
        },
        'admin001',
      ),
    ).rejects.toMatchObject({ code: 'E_INTERVIEWER_INACTIVE', statusCode: 409 });
  });

  test('rejects when overlap exists (E_INTERVIEWER_BUSY)', async () => {
    candidateRepository.findById.mockResolvedValue(makeCandidate());
    interviewerRepository.findById.mockResolvedValue(makeInterviewer());
    interviewRepository.findOverlapping.mockResolvedValue({ _id: 'other_intv' });

    await expect(
      interviewService.schedule(
        {
          candidateId: 'cand001',
          interviewerId: 'ivwr001',
          scheduledAt: new Date(Date.now() + 86400_000),
          meetingUrl: 'https://meet.example.com/r',
        },
        'admin001',
      ),
    ).rejects.toMatchObject({ code: 'E_INTERVIEWER_BUSY', statusCode: 409 });
  });

  test('succeeds and produces two distinct non-empty access tokens', async () => {
    candidateRepository.findById.mockResolvedValue(makeCandidate());
    interviewerRepository.findById.mockResolvedValue(makeInterviewer());
    interviewRepository.findOverlapping.mockResolvedValue(null);

    const saved = makeInterview();
    interviewRepository.create.mockResolvedValue(saved);

    const result = await interviewService.schedule(
      {
        candidateId: 'cand001',
        interviewerId: 'ivwr001',
        scheduledAt: new Date(Date.now() + 86400_000),
        meetingUrl: 'https://meet.example.com/r',
      },
      'admin001',
    );

    // create was called with two tokens
    const createCall = interviewRepository.create.mock.calls[0][0];
    expect(createCall.candidateAccessToken).toBeTruthy();
    expect(createCall.interviewerAccessToken).toBeTruthy();
    expect(createCall.candidateAccessToken).not.toEqual(createCall.interviewerAccessToken);

    // result is shaped like admin presenter
    expect(result).toHaveProperty('candidateAccessToken');
    expect(result).toHaveProperty('interviewerAccessToken');
  });
});

describe('interviewService.requestReschedule', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects when viewerRole is "candidate" (E_FORBIDDEN)', async () => {
    const interview = makeInterview();
    await expect(
      interviewService.requestReschedule(interview, 'candidate', {
        proposedAt: new Date(Date.now() + 172800_000),
      }),
    ).rejects.toMatchObject({ code: 'E_FORBIDDEN', statusCode: 403 });
  });

  test('rejects when interview status is not scheduled (E_NOT_RESCHEDULABLE)', async () => {
    const interview = makeInterview({ status: INTERVIEW_STATUS.RESCHEDULE_REQUESTED });
    await expect(
      interviewService.requestReschedule(interview, 'interviewer', {
        proposedAt: new Date(Date.now() + 172800_000),
      }),
    ).rejects.toMatchObject({ code: 'E_NOT_RESCHEDULABLE', statusCode: 409 });
  });

  test('rejects when a pending request already exists (E_RESCHEDULE_PENDING)', async () => {
    const interview = makeInterview();
    rescheduleRequestRepository.findPendingForInterview.mockResolvedValue({
      _id: 'req001',
      status: RESCHEDULE_STATUS.PENDING,
    });

    await expect(
      interviewService.requestReschedule(interview, 'interviewer', {
        proposedAt: new Date(Date.now() + 172800_000),
      }),
    ).rejects.toMatchObject({ code: 'E_RESCHEDULE_PENDING', statusCode: 409 });
  });
});

describe('interviewService.decideReschedule', () => {
  beforeEach(() => jest.clearAllMocks());

  test('approved: mutates scheduledAt + durationMinutes and resets status to scheduled', async () => {
    const newTime = new Date(Date.now() + 259200_000); // +3 days
    const interview = makeInterview({ status: INTERVIEW_STATUS.RESCHEDULE_REQUESTED });
    const request = {
      _id: 'req001',
      id: 'req001',
      proposedAt: newTime,
      proposedDurationMinutes: 60,
      status: RESCHEDULE_STATUS.PENDING,
      decisionNote: null,
      save: jest.fn().mockResolvedValue(undefined),
    };

    interviewRepository.findById.mockResolvedValue(interview);
    rescheduleRequestRepository.findPendingForInterview.mockResolvedValue(request);
    interviewRepository.findOverlapping.mockResolvedValue(null);

    await interviewService.decideReschedule('intv001', { decision: 'approved', note: 'OK' }, 'admin001');

    expect(interview.scheduledAt).toEqual(newTime);
    expect(interview.durationMinutes).toBe(60);
    expect(interview.status).toBe(INTERVIEW_STATUS.SCHEDULED);
    expect(interview.save).toHaveBeenCalled();

    expect(request.status).toBe(RESCHEDULE_STATUS.APPROVED);
    expect(request.decidedBy).toBe('admin001');
    expect(request.decisionNote).toBe('OK');
    expect(request.save).toHaveBeenCalled();
  });

  test('rejected: keeps original time and resets status to scheduled', async () => {
    const originalTime = new Date(Date.now() + 86400_000);
    const interview = makeInterview({
      scheduledAt: originalTime,
      status: INTERVIEW_STATUS.RESCHEDULE_REQUESTED,
    });
    const request = {
      _id: 'req002',
      id: 'req002',
      proposedAt: new Date(Date.now() + 259200_000),
      proposedDurationMinutes: 60,
      status: RESCHEDULE_STATUS.PENDING,
      decisionNote: null,
      save: jest.fn().mockResolvedValue(undefined),
    };

    interviewRepository.findById.mockResolvedValue(interview);
    rescheduleRequestRepository.findPendingForInterview.mockResolvedValue(request);

    await interviewService.decideReschedule(
      'intv001',
      { decision: 'rejected', note: 'Not possible' },
      'admin001',
    );

    // scheduledAt must NOT have changed
    expect(interview.scheduledAt).toEqual(originalTime);
    expect(interview.status).toBe(INTERVIEW_STATUS.SCHEDULED);
    expect(interview.save).toHaveBeenCalled();

    expect(request.status).toBe(RESCHEDULE_STATUS.REJECTED);
    expect(request.decidedBy).toBe('admin001');
    expect(request.decisionNote).toBe('Not possible');
    expect(request.save).toHaveBeenCalled();
  });
});
