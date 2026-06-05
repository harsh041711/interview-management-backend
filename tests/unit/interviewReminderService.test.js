'use strict';

process.env.MONGODB_URI = 'mongodb://localhost/test';
process.env.JWT_SECRET = 'test-jwt-secret-1234567890';
process.env.TEST_TOKEN_SECRET = 'test-token-secret-abcdefghij';
process.env.INTERVIEW_TOKEN_SECRET = 'test-interview-token-secret-xyz';
process.env.FRONTEND_URL = 'http://localhost:5173';

const mockFind = jest.fn();
jest.mock('../../src/models/Interview', () => ({ find: mockFind }));

jest.mock('../../src/services/emailService', () => ({
  sendInterviewReminderCandidate: jest.fn(),
  sendInterviewReminderInterviewer: jest.fn(),
}));

const emailService = require('../../src/services/emailService');
const reminderService = require('../../src/services/interviewReminderService');

const makeInterview = (overrides = {}) => ({
  _id: 'i1',
  id: 'i1',
  status: 'scheduled',
  scheduledAt: new Date(Date.now() + 20 * 60 * 1000),
  durationMinutes: 45,
  meetingUrl: 'https://zoom.example/abc',
  reminderSentAt: null,
  candidate: { id: 'c1', name: 'Alice', email: 'alice@example.com', resumeUrl: null },
  interviewer: { id: 'iv1', name: 'Bob', email: 'bob@example.com' },
  save: jest.fn().mockResolvedValue(),
  ...overrides,
});

const queryThatResolvesTo = (results) => ({
  populate: jest.fn().mockReturnThis(),
  lean: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue(results),
  then: (fn) => Promise.resolve(results).then(fn),
});

describe('interviewReminderService.processReminders', () => {
  beforeEach(() => jest.clearAllMocks());

  test('sends both emails and marks reminderSentAt when interview within window', async () => {
    const interview = makeInterview();
    mockFind.mockReturnValue(queryThatResolvesTo([interview]));
    await reminderService.processReminders();
    expect(emailService.sendInterviewReminderCandidate).toHaveBeenCalledTimes(1);
    expect(emailService.sendInterviewReminderInterviewer).toHaveBeenCalledTimes(1);
    expect(interview.reminderSentAt).toBeInstanceOf(Date);
    expect(interview.save).toHaveBeenCalled();
  });

  test('does nothing when no matching interviews', async () => {
    mockFind.mockReturnValue(queryThatResolvesTo([]));
    await reminderService.processReminders();
    expect(emailService.sendInterviewReminderCandidate).not.toHaveBeenCalled();
    expect(emailService.sendInterviewReminderInterviewer).not.toHaveBeenCalled();
  });

  test('skips marking reminderSentAt when email send throws', async () => {
    const interview = makeInterview();
    mockFind.mockReturnValue(queryThatResolvesTo([interview]));
    emailService.sendInterviewReminderCandidate.mockRejectedValueOnce(new Error('smtp down'));
    await reminderService.processReminders();
    expect(interview.reminderSentAt).toBeNull();
    expect(interview.save).not.toHaveBeenCalled();
  });

  test('uses the correct filter: scheduled status, null reminderSentAt, scheduledAt within next 30 min', async () => {
    mockFind.mockReturnValue(queryThatResolvesTo([]));
    await reminderService.processReminders();
    expect(mockFind).toHaveBeenCalledTimes(1);
    const filter = mockFind.mock.calls[0][0];
    expect(filter.status).toBe('scheduled');
    expect(filter.reminderSentAt).toBeNull();
    expect(filter.scheduledAt.$gte).toBeInstanceOf(Date);
    expect(filter.scheduledAt.$lte).toBeInstanceOf(Date);
    const windowMs = filter.scheduledAt.$lte.getTime() - filter.scheduledAt.$gte.getTime();
    // Should be approximately 30 minutes (allow small drift due to test execution time)
    expect(windowMs).toBeGreaterThan(29 * 60 * 1000);
    expect(windowMs).toBeLessThan(31 * 60 * 1000);
  });
});
