'use strict';

const Interview = require('../models/Interview');
const emailService = require('./emailService');
const logger = require('../config/logger');

const REMINDER_WINDOW_MINUTES = 30;

const processReminders = async () => {
  const now = new Date();
  const cutoff = new Date(now.getTime() + REMINDER_WINDOW_MINUTES * 60 * 1000);

  const interviews = await Interview.find({
    status: 'scheduled',
    reminderSentAt: null,
    scheduledAt: { $gte: now, $lte: cutoff },
  }).populate('candidate interviewer');

  for (const interview of interviews) {
    const candidate = interview.candidate;
    const interviewer = interview.interviewer;
    if (!candidate || !interviewer) {
      logger.warn('Reminder skipped — missing party', { interviewId: interview._id });
      continue;
    }
    try {
      await emailService.sendInterviewReminderCandidate({ interview, candidate, interviewer });
      await emailService.sendInterviewReminderInterviewer({ interview, candidate, interviewer });
      interview.reminderSentAt = new Date();
      await interview.save();
      logger.info('Interview reminders sent', { interviewId: interview._id });
    } catch (err) {
      logger.error('Failed to send interview reminders', {
        interviewId: interview._id,
        err: err.message,
      });
      // Don't mark reminderSentAt — next tick will retry
    }
  }
};

const start = (intervalMs = 60_000) => {
  const handle = setInterval(() => {
    processReminders().catch((err) => {
      logger.error('Reminder tick crashed', { err: err.message });
    });
  }, intervalMs);
  // Don't keep the event loop alive just for this
  if (handle.unref) handle.unref();
  return handle;
};

module.exports = { processReminders, start, REMINDER_WINDOW_MINUTES };
