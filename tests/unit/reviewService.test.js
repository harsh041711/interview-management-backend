'use strict';

process.env.MONGODB_URI = 'mongodb://localhost/test';
process.env.JWT_SECRET = 'test-jwt-secret-1234567890';
process.env.TEST_TOKEN_SECRET = 'test-token-secret-abcdefghij';
process.env.INTERVIEW_TOKEN_SECRET = 'test-interview-token-secret-xyz';
process.env.FRONTEND_URL = 'http://localhost:5173';

jest.mock('../../src/repositories/reviewRepository');
jest.mock('../../src/repositories/reviewEditRequestRepository');
jest.mock('../../src/repositories/interviewRepository');
jest.mock('../../src/repositories/candidateRepository');
jest.mock('../../src/services/emailService', () => ({
  sendReviewSubmitted: jest.fn(),
  sendReviewEdited: jest.fn(),
  sendEditRequestSubmitted: jest.fn(),
  sendEditRequestApproved: jest.fn(),
  sendEditRequestRejected: jest.fn(),
}));

const reviewService = require('../../src/services/reviewService');
const reviewRepo = require('../../src/repositories/reviewRepository');
const editRepo = require('../../src/repositories/reviewEditRequestRepository');
const interviewRepo = require('../../src/repositories/interviewRepository');
const candidateRepo = require('../../src/repositories/candidateRepository');
const { CANDIDATE_STATUS, INTERVIEW_STATUS, REVIEW_EDIT_STATUS } = require('../../src/utils/constants');

describe('reviewService.submit', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects when interview not found', async () => {
    interviewRepo.findByIdPopulated.mockResolvedValue(null);
    await expect(reviewService.submit({
      interviewId: 'i1', interviewerId: 'iv1',
      ratings: { knowledge: 5, communication: 5, confidence: 5 }, comments: 'good interview',
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test('rejects when interviewer is not the one assigned', async () => {
    interviewRepo.findByIdPopulated.mockResolvedValue({
      _id: 'i1', interviewer: { _id: 'iv2' }, candidate: { _id: 'c1' }, status: INTERVIEW_STATUS.COMPLETED,
    });
    await expect(reviewService.submit({
      interviewId: 'i1', interviewerId: 'iv1',
      ratings: { knowledge: 5, communication: 5, confidence: 5 }, comments: 'good interview',
    })).rejects.toMatchObject({ code: 'E_FORBIDDEN' });
  });

  test('rejects when interview not completed', async () => {
    interviewRepo.findByIdPopulated.mockResolvedValue({
      _id: 'i1', interviewer: { _id: 'iv1' }, candidate: { _id: 'c1' }, status: INTERVIEW_STATUS.SCHEDULED,
    });
    await expect(reviewService.submit({
      interviewId: 'i1', interviewerId: 'iv1',
      ratings: { knowledge: 5, communication: 5, confidence: 5 }, comments: 'good interview',
    })).rejects.toMatchObject({ code: 'E_INTERVIEW_NOT_COMPLETED' });
  });

  test('rejects duplicate review', async () => {
    interviewRepo.findByIdPopulated.mockResolvedValue({
      _id: 'i1', interviewer: { _id: 'iv1' }, candidate: { _id: 'c1' }, status: INTERVIEW_STATUS.COMPLETED,
    });
    reviewRepo.findByInterview.mockResolvedValue({ _id: 'r1' });
    await expect(reviewService.submit({
      interviewId: 'i1', interviewerId: 'iv1',
      ratings: { knowledge: 5, communication: 5, confidence: 5 }, comments: 'good interview',
    })).rejects.toMatchObject({ code: 'E_REVIEW_EXISTS' });
  });

  test('happy path: creates review, transitions candidate shortlisted->awaiting_decision', async () => {
    interviewRepo.findByIdPopulated.mockResolvedValue({
      _id: 'i1', interviewer: { _id: 'iv1', name: 'Bob' }, candidate: { _id: 'c1' }, status: INTERVIEW_STATUS.COMPLETED,
    });
    reviewRepo.findByInterview.mockResolvedValue(null);
    const created = { _id: 'r1', candidate: 'c1' };
    reviewRepo.create.mockResolvedValue(created);
    const candidate = { _id: 'c1', status: CANDIDATE_STATUS.SHORTLISTED, save: jest.fn().mockResolvedValue() };
    candidateRepo.findById.mockResolvedValue(candidate);

    const result = await reviewService.submit({
      interviewId: 'i1', interviewerId: 'iv1',
      ratings: { knowledge: 4, communication: 5, confidence: 4 }, comments: 'thorough and clear',
    });
    expect(result).toBe(created);
    expect(candidate.status).toBe(CANDIDATE_STATUS.AWAITING_DECISION);
    expect(candidate.save).toHaveBeenCalled();
  });

  test('does NOT transition candidate when status is not shortlisted', async () => {
    interviewRepo.findByIdPopulated.mockResolvedValue({
      _id: 'i1', interviewer: { _id: 'iv1' }, candidate: { _id: 'c1' }, status: INTERVIEW_STATUS.COMPLETED,
    });
    reviewRepo.findByInterview.mockResolvedValue(null);
    reviewRepo.create.mockResolvedValue({ _id: 'r1', candidate: 'c1' });
    const candidate = { _id: 'c1', status: CANDIDATE_STATUS.AWAITING_DECISION, save: jest.fn() };
    candidateRepo.findById.mockResolvedValue(candidate);

    await reviewService.submit({
      interviewId: 'i1', interviewerId: 'iv1',
      ratings: { knowledge: 4, communication: 5, confidence: 4 }, comments: 'all good',
    });
    expect(candidate.save).not.toHaveBeenCalled();
  });
});

describe('reviewService.requestEdit', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects when review not found', async () => {
    reviewRepo.findByIdRaw.mockResolvedValue(null);
    await expect(reviewService.requestEdit({ reviewId: 'r1', interviewerId: 'iv1' }))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  test('rejects when interviewer is not the review owner', async () => {
    reviewRepo.findByIdRaw.mockResolvedValue({ _id: 'r1', interviewer: 'iv2' });
    await expect(reviewService.requestEdit({ reviewId: 'r1', interviewerId: 'iv1' }))
      .rejects.toMatchObject({ code: 'E_FORBIDDEN' });
  });

  test('rejects when a pending request already exists', async () => {
    reviewRepo.findByIdRaw.mockResolvedValue({ _id: 'r1', interviewer: 'iv1' });
    editRepo.findPendingForReview.mockResolvedValue({ _id: 'er1' });
    await expect(reviewService.requestEdit({ reviewId: 'r1', interviewerId: 'iv1' }))
      .rejects.toMatchObject({ code: 'E_EDIT_REQUEST_PENDING' });
  });

  test('happy path creates request', async () => {
    reviewRepo.findByIdRaw.mockResolvedValue({ _id: 'r1', interviewer: 'iv1' });
    editRepo.findPendingForReview.mockResolvedValue(null);
    const created = { _id: 'er1', id: 'er1' };
    editRepo.create.mockResolvedValue(created);
    const result = await reviewService.requestEdit({ reviewId: 'r1', interviewerId: 'iv1', reason: 'typo' });
    expect(result).toBe(created);
    expect(editRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      review: 'r1', interviewer: 'iv1', reason: 'typo', status: REVIEW_EDIT_STATUS.PENDING,
    }));
  });
});

describe('reviewService.edit', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects when no approved-not-consumed request exists', async () => {
    reviewRepo.findByIdRaw.mockResolvedValue({ _id: 'r1', interviewer: 'iv1' });
    editRepo.findApprovedNotConsumed.mockResolvedValue(null);
    await expect(reviewService.edit({
      reviewId: 'r1', interviewerId: 'iv1',
      ratings: { knowledge: 5, communication: 5, confidence: 5 }, comments: 'updated note',
    })).rejects.toMatchObject({ code: 'E_EDIT_NOT_APPROVED' });
  });

  test('happy path updates review and consumes the approval', async () => {
    const review = {
      _id: 'r1', interviewer: 'iv1', editCount: 0, ratings: {}, comments: 'old',
      save: jest.fn().mockResolvedValue(),
    };
    reviewRepo.findByIdRaw.mockResolvedValue(review);
    const approval = { _id: 'a1', consumed: false, save: jest.fn().mockResolvedValue() };
    editRepo.findApprovedNotConsumed.mockResolvedValue(approval);
    await reviewService.edit({
      reviewId: 'r1', interviewerId: 'iv1',
      ratings: { knowledge: 5, communication: 5, confidence: 4 }, comments: 'new comments here',
    });
    expect(review.editCount).toBe(1);
    expect(review.lastEditedAt).toBeInstanceOf(Date);
    expect(review.save).toHaveBeenCalled();
    expect(approval.consumed).toBe(true);
    expect(approval.save).toHaveBeenCalled();
  });
});

describe('reviewService.decideEdit', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects when request not found', async () => {
    editRepo.findById.mockResolvedValue(null);
    await expect(reviewService.decideEdit({
      requestId: 'er1', decision: REVIEW_EDIT_STATUS.APPROVED, adminId: 'a1',
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test('rejects when request already decided', async () => {
    editRepo.findById.mockResolvedValue({ _id: 'er1', status: REVIEW_EDIT_STATUS.APPROVED });
    await expect(reviewService.decideEdit({
      requestId: 'er1', decision: REVIEW_EDIT_STATUS.REJECTED, adminId: 'a1',
    })).rejects.toMatchObject({ code: 'E_ALREADY_DECIDED' });
  });

  test('happy path approves and updates the request', async () => {
    editRepo.findById.mockResolvedValue({ _id: 'er1', id: 'er1', status: REVIEW_EDIT_STATUS.PENDING });
    const updated = { _id: 'er1', id: 'er1', status: REVIEW_EDIT_STATUS.APPROVED };
    editRepo.updateById.mockResolvedValue(updated);
    const result = await reviewService.decideEdit({
      requestId: 'er1', decision: REVIEW_EDIT_STATUS.APPROVED, adminId: 'a1', note: 'sure',
    });
    expect(result).toBe(updated);
    expect(editRepo.updateById).toHaveBeenCalledWith('er1', expect.objectContaining({
      status: REVIEW_EDIT_STATUS.APPROVED, decidedBy: 'a1', decisionNote: 'sure',
    }));
  });
});
