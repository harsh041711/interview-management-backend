'use strict';

const interviewRepository = require('../repositories/interviewRepository');
const rescheduleRequestRepository = require('../repositories/rescheduleRequestRepository');
const candidateRepository = require('../repositories/candidateRepository');
const interviewerRepository = require('../repositories/interviewerRepository');
const adminRepository = require('../repositories/adminRepository');
const { generateInterviewToken } = require('../utils/interviewToken');
const emailService = require('./emailService');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const env = require('../config/env');
const {
  CANDIDATE_STATUS,
  INTERVIEW_STATUS,
  INTERVIEW_DEFAULT_DURATION_MINUTES,
  RESCHEDULE_STATUS,
} = require('../utils/constants');

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

const buildAccessUrl = (token) => {
  const base = env.frontendUrl.replace(/\/$/, '');
  return `${base}/interview/${token}`;
};

// ---------------------------------------------------------------------------
// Presenter
// ---------------------------------------------------------------------------

/**
 * Sanitize an interview document for the given viewerRole.
 * Pass latestPendingReschedule explicitly (already fetched by caller).
 *
 * viewerRole = undefined → admin (full payload)
 * viewerRole = 'candidate' | 'interviewer' → restricted payload
 */
const presentInterview = (interview, { viewerRole, latestPendingReschedule } = {}) => {
  const doc = interview.toObject ? interview.toObject() : interview;

  if (!viewerRole) {
    // Admin — full payload
    return {
      id: doc._id || doc.id,
      candidate: doc.candidate,
      interviewer: doc.interviewer,
      scheduledAt: doc.scheduledAt,
      durationMinutes: doc.durationMinutes,
      meetingUrl: doc.meetingUrl,
      notes: doc.notes ?? null,
      candidateAccessToken: doc.candidateAccessToken,
      interviewerAccessToken: doc.interviewerAccessToken,
      status: doc.status,
      scheduledBy: doc.scheduledBy,
      completedAt: doc.completedAt ?? null,
      completionNote: doc.completionNote ?? null,
      cancelledAt: doc.cancelledAt ?? null,
      cancelReason: doc.cancelReason ?? null,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  // Populated sub-objects (may be plain objects after populate)
  const cand = doc.candidate || {};
  const ivwr = doc.interviewer || {};

  const base = {
    id: doc._id || doc.id,
    schedule: {
      scheduledAt: doc.scheduledAt,
      durationMinutes: doc.durationMinutes,
    },
    candidate: {
      name: cand.name,
      email: cand.email,
    },
    interviewer: {
      name: ivwr.name,
      expertise: ivwr.expertise,
    },
    meetingUrl: doc.meetingUrl,
    status: doc.status,
    viewerRole,
    canRequestReschedule: false,
    latestPendingReschedule: latestPendingReschedule
      ? {
          id: latestPendingReschedule._id || latestPendingReschedule.id,
          proposedAt: latestPendingReschedule.proposedAt,
          proposedDurationMinutes: latestPendingReschedule.proposedDurationMinutes ?? null,
          reason: latestPendingReschedule.reason ?? null,
          status: latestPendingReschedule.status,
          createdAt: latestPendingReschedule.createdAt,
        }
      : null,
  };

  if (viewerRole === 'interviewer') {
    base.notes = doc.notes ?? null;
    base.canRequestReschedule =
      doc.status === INTERVIEW_STATUS.SCHEDULED && !latestPendingReschedule;
  }

  return base;
};

// ---------------------------------------------------------------------------
// Fire-and-forget email helpers
// ---------------------------------------------------------------------------

const resolveHrEmail = async () => {
  const admin = await adminRepository.findByEmail(env.admin.seed.email || '');
  if (admin?.hrNotificationEmail) return admin.hrNotificationEmail;
  if (env.admin.seed.hrEmail) return env.admin.seed.hrEmail;
  return env.smtp.user;
};

/**
 * Ensure candidate and interviewer are plain JS objects (populated fields).
 */
const ensurePopulated = async (interview) => {
  let cand = interview.candidate;
  let ivwr = interview.interviewer;

  // If still an ObjectId (not populated), fetch manually
  if (cand && typeof cand === 'object' && !cand.name) {
    cand = await candidateRepository.findById(cand);
  }
  if (ivwr && typeof ivwr === 'object' && !ivwr.name) {
    ivwr = await interviewerRepository.findById(ivwr);
  }
  return { candidate: cand, interviewer: ivwr };
};

const queueScheduledEmails = (interview) => {
  setImmediate(async () => {
    try {
      const { candidate, interviewer } = await ensurePopulated(interview);
      const candidateUrl = buildAccessUrl(interview.candidateAccessToken);
      const interviewerUrl = buildAccessUrl(interview.interviewerAccessToken);

      try {
        await emailService.sendInterviewScheduled({
          recipient: 'candidate',
          interview,
          candidate,
          interviewer,
          accessUrl: candidateUrl,
        });
      } catch (err) {
        logger.error('Scheduled email to candidate failed', {
          candidateId: candidate?.id || candidate?._id,
          err: err.message,
        });
      }

      try {
        await emailService.sendInterviewScheduled({
          recipient: 'interviewer',
          interview,
          candidate,
          interviewer,
          accessUrl: interviewerUrl,
        });
      } catch (err) {
        logger.error('Scheduled email to interviewer failed', {
          interviewerId: interviewer?.id || interviewer?._id,
          err: err.message,
        });
      }
    } catch (err) {
      logger.error('queueScheduledEmails outer failure', { err: err.message });
    }
  });
};

const queueRescheduleRequestedEmail = (interview, request) => {
  setImmediate(async () => {
    try {
      const { candidate, interviewer } = await ensurePopulated(interview);
      const adminEmail = await resolveHrEmail();
      if (!adminEmail) {
        logger.warn('No HR email configured — skipping reschedule-requested email');
        return;
      }
      await emailService.sendRescheduleRequested({
        adminEmail,
        interview,
        request,
        candidate,
        interviewer,
      });
    } catch (err) {
      logger.error('Reschedule-requested email failed', { err: err.message });
    }
  });
};

const queueRescheduleApprovedEmails = (interview, request) => {
  setImmediate(async () => {
    try {
      const { candidate, interviewer } = await ensurePopulated(interview);
      const candidateUrl = buildAccessUrl(interview.candidateAccessToken);
      const interviewerUrl = buildAccessUrl(interview.interviewerAccessToken);
      const decisionNote = request.decisionNote || null;

      try {
        await emailService.sendRescheduleApproved({
          recipient: 'candidate',
          interview,
          candidate,
          interviewer,
          accessUrl: candidateUrl,
          decisionNote,
        });
      } catch (err) {
        logger.error('Reschedule-approved email to candidate failed', { err: err.message });
      }

      try {
        await emailService.sendRescheduleApproved({
          recipient: 'interviewer',
          interview,
          candidate,
          interviewer,
          accessUrl: interviewerUrl,
          decisionNote,
        });
      } catch (err) {
        logger.error('Reschedule-approved email to interviewer failed', { err: err.message });
      }
    } catch (err) {
      logger.error('queueRescheduleApprovedEmails outer failure', { err: err.message });
    }
  });
};

const queueRescheduleRejectedEmail = (interview, request) => {
  setImmediate(async () => {
    try {
      const { candidate, interviewer } = await ensurePopulated(interview);
      await emailService.sendRescheduleRejected({ interview, candidate, interviewer, request });
    } catch (err) {
      logger.error('Reschedule-rejected email to interviewer failed', { err: err.message });
    }
  });
};

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

const schedule = async (
  { candidateId, interviewerId, scheduledAt, durationMinutes, meetingUrl, notes },
  adminId,
) => {
  const candidate = await candidateRepository.findById(candidateId);
  if (!candidate) throw ApiError.notFound('Candidate not found');
  if (candidate.status !== CANDIDATE_STATUS.SHORTLISTED) {
    throw ApiError.conflict('Candidate is not shortlisted', { code: 'E_NOT_SHORTLISTED' });
  }

  const interviewer = await interviewerRepository.findById(interviewerId);
  if (!interviewer) throw ApiError.notFound('Interviewer not found');
  if (!interviewer.isActive) {
    throw ApiError.conflict('Interviewer is inactive', { code: 'E_INTERVIEWER_INACTIVE' });
  }

  const duration = durationMinutes || INTERVIEW_DEFAULT_DURATION_MINUTES;
  const start = new Date(scheduledAt);
  const end = new Date(start.getTime() + duration * 60_000);

  const overlap = await interviewRepository.findOverlapping({ interviewerId, start, end });
  if (overlap) {
    throw ApiError.conflict('Interviewer has another interview in this window', {
      code: 'E_INTERVIEWER_BUSY',
    });
  }

  // Generate two distinct tokens
  let candidateToken, interviewerToken;
  do {
    candidateToken = generateInterviewToken().token;
    interviewerToken = generateInterviewToken().token;
  } while (candidateToken === interviewerToken);

  const saved = await interviewRepository.create({
    candidate: candidateId,
    interviewer: interviewerId,
    scheduledAt: start,
    durationMinutes: duration,
    meetingUrl,
    notes: notes || undefined,
    candidateAccessToken: candidateToken,
    interviewerAccessToken: interviewerToken,
    status: INTERVIEW_STATUS.SCHEDULED,
    scheduledBy: adminId,
  });

  queueScheduledEmails(saved);
  return presentInterview(saved);
};

const update = async (id, patch, adminId) => {
  const interview = await interviewRepository.findById(id);
  if (!interview) throw ApiError.notFound('Interview not found');
  if (interview.status !== INTERVIEW_STATUS.SCHEDULED) {
    throw ApiError.conflict(
      `Cannot update interview in '${interview.status}' status — must be 'scheduled'`,
      { code: 'E_NOT_UPDATABLE' },
    );
  }

  const pendingReschedule = await rescheduleRequestRepository.findPendingForInterview(id);
  if (pendingReschedule) {
    throw ApiError.conflict('Decide pending reschedule first', { code: 'E_RESCHEDULE_PENDING' });
  }

  const newScheduledAt = patch.scheduledAt ? new Date(patch.scheduledAt) : interview.scheduledAt;
  const newDuration = patch.durationMinutes || interview.durationMinutes;

  if (patch.scheduledAt || patch.durationMinutes) {
    const end = new Date(newScheduledAt.getTime() + newDuration * 60_000);
    const overlap = await interviewRepository.findOverlapping({
      interviewerId: String(interview.interviewer),
      start: newScheduledAt,
      end,
      excludeInterviewId: id,
    });
    if (overlap) {
      throw ApiError.conflict('Interviewer has another interview in this window', {
        code: 'E_INTERVIEWER_BUSY',
      });
    }
  }

  const updated = await interviewRepository.updateById(id, patch);

  const timingOrUrlChanged =
    patch.scheduledAt || patch.durationMinutes || patch.meetingUrl;
  if (timingOrUrlChanged) {
    queueScheduledEmails(updated);
  }

  return presentInterview(updated);
};

const requestReschedule = async (interview, viewerRole, { proposedAt, proposedDurationMinutes, reason }) => {
  if (viewerRole !== 'interviewer') {
    throw ApiError.forbidden('Only the interviewer can request a reschedule', {
      code: 'E_FORBIDDEN',
    });
  }

  if (interview.status !== INTERVIEW_STATUS.SCHEDULED) {
    throw ApiError.conflict(
      `Cannot reschedule an interview that is ${interview.status}`,
      { code: 'E_NOT_RESCHEDULABLE' },
    );
  }

  const existing = await rescheduleRequestRepository.findPendingForInterview(interview.id || interview._id);
  if (existing) {
    throw ApiError.conflict('A reschedule request is already pending', {
      code: 'E_RESCHEDULE_PENDING',
    });
  }

  const request = await rescheduleRequestRepository.create({
    interview: interview.id || interview._id,
    proposedAt: new Date(proposedAt),
    proposedDurationMinutes: proposedDurationMinutes || undefined,
    reason: reason || undefined,
    status: RESCHEDULE_STATUS.PENDING,
  });

  await interviewRepository.updateById(interview.id || interview._id, {
    status: INTERVIEW_STATUS.RESCHEDULE_REQUESTED,
  });

  queueRescheduleRequestedEmail(interview, request);
  return request;
};

const decideReschedule = async (interviewId, { decision, note }, adminId) => {
  const interview = await interviewRepository.findById(interviewId);
  if (!interview) throw ApiError.notFound('Interview not found');

  const request = await rescheduleRequestRepository.findPendingForInterview(interviewId);
  if (!request) {
    throw ApiError.notFound('No pending reschedule request', { code: 'E_NO_PENDING_RESCHEDULE' });
  }

  const now = new Date();

  if (decision === 'approved') {
    const newStart = new Date(request.proposedAt);
    const newDuration = request.proposedDurationMinutes || interview.durationMinutes;
    const newEnd = new Date(newStart.getTime() + newDuration * 60_000);

    const overlap = await interviewRepository.findOverlapping({
      interviewerId: String(interview.interviewer),
      start: newStart,
      end: newEnd,
      excludeInterviewId: interviewId,
    });
    if (overlap) {
      throw ApiError.conflict('Interviewer has another interview in this window', {
        code: 'E_INTERVIEWER_BUSY',
      });
    }

    interview.scheduledAt = newStart;
    interview.durationMinutes = newDuration;
    interview.status = INTERVIEW_STATUS.SCHEDULED;
    await interview.save();

    request.status = RESCHEDULE_STATUS.APPROVED;
    request.decidedBy = adminId;
    request.decidedAt = now;
    request.decisionNote = note || null;
    await request.save();

    queueRescheduleApprovedEmails(interview, request);
  } else {
    // rejected
    request.status = RESCHEDULE_STATUS.REJECTED;
    request.decidedBy = adminId;
    request.decidedAt = now;
    request.decisionNote = note || null;
    await request.save();

    interview.status = INTERVIEW_STATUS.SCHEDULED;
    await interview.save();

    queueRescheduleRejectedEmail(interview, request);
  }

  return request;
};

const cancel = async (id, { reason } = {}) => {
  const interview = await interviewRepository.findById(id);
  if (!interview) throw ApiError.notFound('Interview not found');
  if (interview.status === INTERVIEW_STATUS.COMPLETED) {
    throw ApiError.conflict('Cannot cancel a completed interview', { code: 'E_ALREADY_COMPLETED' });
  }
  if (interview.status === INTERVIEW_STATUS.CANCELLED) {
    throw ApiError.conflict('Interview is already cancelled', { code: 'E_ALREADY_CANCELLED' });
  }

  interview.status = INTERVIEW_STATUS.CANCELLED;
  interview.cancelledAt = new Date();
  interview.cancelReason = reason || null;
  await interview.save();

  return presentInterview(interview);
};

const complete = async (id, { note } = {}) => {
  const interview = await interviewRepository.findById(id);
  if (!interview) throw ApiError.notFound('Interview not found');
  if (interview.status !== INTERVIEW_STATUS.SCHEDULED) {
    throw ApiError.conflict(
      interview.status === INTERVIEW_STATUS.RESCHEDULE_REQUESTED
        ? 'Decide pending reschedule before completing the interview'
        : `Cannot complete interview in '${interview.status}' status`,
      { code: 'E_NOT_COMPLETABLE' },
    );
  }

  interview.status = INTERVIEW_STATUS.COMPLETED;
  interview.completedAt = new Date();
  interview.completionNote = note || null;
  await interview.save();

  return presentInterview(interview);
};

const list = async (query) => {
  const result = await interviewRepository.list(query);
  return {
    ...result,
    items: result.items.map((i) => presentInterview(i)),
  };
};

const detail = async (id) => {
  const interview = await interviewRepository.findByIdPopulated(id);
  if (!interview) throw ApiError.notFound('Interview not found');

  const [pendingReschedule, rescheduleHistory] = await Promise.all([
    rescheduleRequestRepository.findPendingForInterview(id),
    rescheduleRequestRepository.findByInterview(id),
  ]);

  return {
    interview: presentInterview(interview),
    pendingReschedule: pendingReschedule || null,
    rescheduleHistory,
  };
};

module.exports = {
  presentInterview,
  schedule,
  update,
  requestReschedule,
  decideReschedule,
  cancel,
  complete,
  list,
  detail,
  buildAccessUrl,
  queueScheduledEmails,
  queueRescheduleRequestedEmail,
  queueRescheduleApprovedEmails,
  queueRescheduleRejectedEmail,
};
