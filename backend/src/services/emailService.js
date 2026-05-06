'use strict';

const nodemailer = require('nodemailer');
const env = require('../config/env');
const logger = require('../config/logger');
const adminRepository = require('../repositories/adminRepository');
const submissionRepository = require('../repositories/submissionRepository');
const { buildReportHtml, buildReportText } = require('../templates/reportEmail');
const { buildInviteHtml, buildInviteText } = require('../templates/inviteEmail');
const { buildShortlistedHtml, buildShortlistedText } = require('../templates/round1ShortlistedEmail');
const { buildRejectedHtml, buildRejectedText } = require('../templates/round1RejectedEmail');
const { buildDisqualifiedHtml, buildDisqualifiedText } = require('../templates/round1DisqualifiedEmail');
const { ROUND1_OUTCOMES } = require('../utils/constants');

let cachedTransporter = null;

const getTransporter = () => {
  if (cachedTransporter) return cachedTransporter;
  const { host, port, secure, user, password } = env.smtp;
  if (!host || !user || !password) {
    logger.warn('SMTP credentials missing — emails will not be sent.');
    return null;
  }
  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass: password },
  });
  return cachedTransporter;
};

const resolveHrEmail = async () => {
  const admin = await adminRepository.findByEmail(env.admin.seed.email || '');
  if (admin?.hrNotificationEmail) return admin.hrNotificationEmail;
  if (env.admin.seed.hrEmail) return env.admin.seed.hrEmail;
  return env.smtp.user;
};

const sendInterviewReport = async ({ candidate, submission }) => {
  const transporter = getTransporter();
  if (!transporter) throw new Error('SMTP not configured');

  // Re-fetch the populated submission for fresh question data.
  const populated = await submissionRepository.findById(submission.id || submission._id);
  if (!populated) throw new Error('Submission not found for emailing');

  const hrTo = await resolveHrEmail();
  if (!hrTo) throw new Error('No HR email recipient configured');

  const subject = `Interview Report — ${candidate.name} (${populated.percentage}%)`;
  const html = buildReportHtml({ candidate, submission: populated });
  const text = buildReportText({ candidate, submission: populated });

  const info = await transporter.sendMail({
    from: env.smtp.from,
    to: hrTo,
    subject,
    text,
    html,
  });

  logger.info('Interview report sent', { messageId: info.messageId, to: hrTo, candidate: candidate.id });
  return info;
};

const sendCandidateInvite = async ({ candidate, testUrl }) => {
  const transporter = getTransporter();
  if (!transporter) throw new Error('SMTP not configured');
  if (!candidate?.email) throw new Error('Candidate email is missing');

  const subject = `Your ${env.appName} interview link`;
  const html = buildInviteHtml({
    candidate,
    testUrl,
    appName: env.appName,
    expiresAt: candidate.tokenExpiresAt,
  });
  const text = buildInviteText({
    candidate,
    testUrl,
    appName: env.appName,
    expiresAt: candidate.tokenExpiresAt,
  });

  const info = await transporter.sendMail({
    from: env.smtp.from,
    to: candidate.email,
    subject,
    text,
    html,
  });

  logger.info('Candidate invite sent', { messageId: info.messageId, to: candidate.email, candidate: candidate.id });
  return info;
};

const sendRound1Result = async ({ candidate, submission, outcome }) => {
  const transporter = getTransporter();
  if (!transporter) throw new Error('SMTP not configured');
  if (!candidate?.email) throw new Error('Candidate email is missing');

  const appName = env.appName;

  let subject;
  let html;
  let text;

  if (outcome === ROUND1_OUTCOMES.SHORTLISTED) {
    subject = `You're shortlisted — ${appName} interview`;
    html = buildShortlistedHtml({ candidate, appName });
    text = buildShortlistedText({ candidate, appName });
  } else if (outcome === ROUND1_OUTCOMES.REJECTED) {
    subject = `${appName} assessment update`;
    html = buildRejectedHtml({ candidate, appName });
    text = buildRejectedText({ candidate, appName });
  } else if (outcome === ROUND1_OUTCOMES.DISQUALIFIED) {
    subject = `${appName} assessment invalidated`;
    html = buildDisqualifiedHtml({ candidate, appName });
    text = buildDisqualifiedText({ candidate, appName });
  } else {
    throw new Error(`Unknown Round 1 outcome: ${outcome}`);
  }

  const info = await transporter.sendMail({
    from: env.smtp.from,
    to: candidate.email,
    subject,
    text,
    html,
  });

  logger.info('Round 1 result sent', { to: candidate.email, outcome, messageId: info.messageId });
  return info;
};

module.exports = { sendInterviewReport, sendCandidateInvite, sendRound1Result, getTransporter };
