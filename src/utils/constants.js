'use strict';

const QUESTION_TYPES = Object.freeze({
  MCQ: 'mcq',
  MULTI_SELECT: 'multi_select',
  ONE_LINE: 'one_line',
  DESCRIPTIVE: 'descriptive',
});

const QUESTION_TYPE_LIST = Object.values(QUESTION_TYPES);

const DIFFICULTY = Object.freeze({
  EASY: 'easy',
  MEDIUM: 'medium',
  HARD: 'hard',
});

const DIFFICULTY_LIST = Object.values(DIFFICULTY);

const QUESTION_SOURCE = Object.freeze({
  MANUAL: 'manual',
  AI: 'ai',
});

const CANDIDATE_STATUS = Object.freeze({
  PENDING: 'pending',
  PHOTO_CAPTURED: 'photo_captured',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  EXPIRED: 'expired',
  CHEATED: 'cheated',
  SHORTLISTED: 'shortlisted',
  REJECTED: 'rejected',
});

const CANDIDATE_STATUS_LIST = Object.values(CANDIDATE_STATUS);

const SESSION_STATUS = Object.freeze({
  ACTIVE: 'active',
  SUBMITTED: 'submitted',
  AUTO_SUBMITTED: 'auto_submitted',
  CHEATED: 'cheated',
  EXPIRED: 'expired',
});

const SESSION_STATUS_LIST = Object.values(SESSION_STATUS);

const CHEAT_EVENT_TYPES = Object.freeze({
  TAB_SWITCH: 'tab_switch',
  WINDOW_BLUR: 'window_blur',
  VISIBILITY_HIDDEN: 'visibility_hidden',
  COPY_DETECTED: 'copy_detected',
  PASTE_DETECTED: 'paste_detected',
});

const CHEAT_EVENT_TYPE_LIST = Object.values(CHEAT_EVENT_TYPES);

const ROLES = Object.freeze({ ADMIN: 'admin' });

const AI_PROVIDERS = Object.freeze({ GEMINI: 'gemini', GROQ: 'groq' });

const PASS_THRESHOLD_PERCENT = 50;

const INTERVIEW_DEFAULT_DURATION_MINUTES = 45;

const INTERVIEW_STATUS = Object.freeze({
  SCHEDULED: 'scheduled',
  RESCHEDULE_REQUESTED: 'reschedule_requested',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
});

const INTERVIEW_STATUS_LIST = Object.values(INTERVIEW_STATUS);

const RESCHEDULE_STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
});

const RESCHEDULE_STATUS_LIST = Object.values(RESCHEDULE_STATUS);

const ROUND1_OUTCOMES = Object.freeze({
  SHORTLISTED: 'shortlisted',
  REJECTED: 'rejected',
  DISQUALIFIED: 'disqualified',
});

const ROUND1_OUTCOMES_LIST = Object.values(ROUND1_OUTCOMES);

module.exports = {
  QUESTION_TYPES,
  QUESTION_TYPE_LIST,
  DIFFICULTY,
  DIFFICULTY_LIST,
  QUESTION_SOURCE,
  CANDIDATE_STATUS,
  CANDIDATE_STATUS_LIST,
  SESSION_STATUS,
  SESSION_STATUS_LIST,
  CHEAT_EVENT_TYPES,
  CHEAT_EVENT_TYPE_LIST,
  ROLES,
  AI_PROVIDERS,
  PASS_THRESHOLD_PERCENT,
  INTERVIEW_DEFAULT_DURATION_MINUTES,
  INTERVIEW_STATUS,
  INTERVIEW_STATUS_LIST,
  RESCHEDULE_STATUS,
  RESCHEDULE_STATUS_LIST,
  ROUND1_OUTCOMES,
  ROUND1_OUTCOMES_LIST,
};
