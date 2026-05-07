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
const { buildScheduledHtml, buildScheduledText } = require('../templates/interviewScheduledEmail');
const { buildRescheduleRequestedHtml, buildRescheduleRequestedText } = require('../templates/rescheduleRequestedEmail');
const { buildRescheduleApprovedHtml, buildRescheduleApprovedText } = require('../templates/rescheduleApprovedEmail');
const { buildRescheduleRejectedHtml, buildRescheduleRejectedText } = require('../templates/rescheduleRejectedEmail');
const { buildAccountSetupHtml, buildAccountSetupText } = require('../templates/accountSetupEmail');
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

const buildResumeAttachment = (candidate) => {
  if (!candidate?.resumeUrl) return null;
  const filename =
    candidate.resumeOriginalName ||
    `${(candidate.name || 'candidate').replace(/\s+/g, '_')}-resume`;
  return {
    filename,
    path: candidate.resumeUrl,
    contentType: candidate.resumeMimeType || undefined,
  };
};

const sendInterviewScheduled = async ({ recipient, interview, candidate, interviewer, accessUrl }) => {
  const transporter = getTransporter();
  if (!transporter) throw new Error('SMTP not configured');

  const scheduledDate = new Date(interview.scheduledAt).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const subject = `Interview scheduled — Round 2 on ${scheduledDate}`;
  const to = recipient === 'interviewer' ? interviewer.email : candidate.email;

  const html = buildScheduledHtml({
    recipient,
    candidate,
    interviewer,
    scheduledAt: interview.scheduledAt,
    durationMinutes: interview.durationMinutes,
    meetingUrl: interview.meetingUrl,
    accessUrl,
    notes: interview.notes,
    hasResume: !!candidate?.resumeUrl,
  });
  const text = buildScheduledText({
    recipient,
    candidate,
    interviewer,
    scheduledAt: interview.scheduledAt,
    durationMinutes: interview.durationMinutes,
    meetingUrl: interview.meetingUrl,
    accessUrl,
    notes: interview.notes,
    hasResume: !!candidate?.resumeUrl,
  });

  const attachments = [];
  if (recipient === 'interviewer') {
    const resume = buildResumeAttachment(candidate);
    if (resume) attachments.push(resume);
  }

  const info = await transporter.sendMail({
    from: env.smtp.from,
    to,
    subject,
    text,
    html,
    ...(attachments.length ? { attachments } : {}),
  });
  logger.info('Interview scheduled email sent', {
    messageId: info.messageId,
    to,
    recipient,
    attachedResume: attachments.length > 0,
  });
  return info;
};

const sendRescheduleRequested = async ({ adminEmail, interview, request, candidate, interviewer }) => {
  const transporter = getTransporter();
  if (!transporter) throw new Error('SMTP not configured');

  const baseUrl = env.frontendUrl.replace(/\/$/, '');
  const adminUrl = `${baseUrl}/interviews/${interview.id || interview._id}`;
  const subject = `Reschedule request — ${interviewer.name} / ${candidate.name}`;

  const html = buildRescheduleRequestedHtml({ interview, request, candidate, interviewer, adminUrl });
  const text = buildRescheduleRequestedText({ interview, request, candidate, interviewer, adminUrl });

  const info = await transporter.sendMail({ from: env.smtp.from, to: adminEmail, subject, text, html });
  logger.info('Reschedule requested email sent', { messageId: info.messageId, to: adminEmail });
  return info;
};

const sendRescheduleApproved = async ({ recipient, interview, candidate, interviewer, accessUrl, decisionNote }) => {
  const transporter = getTransporter();
  if (!transporter) throw new Error('SMTP not configured');

  const to = recipient === 'interviewer' ? interviewer.email : candidate.email;
  const subject = `Reschedule approved — new interview time confirmed`;

  const html = buildRescheduleApprovedHtml({ recipient, candidate, interviewer, interview, accessUrl, decisionNote });
  const text = buildRescheduleApprovedText({ recipient, candidate, interviewer, interview, accessUrl, decisionNote });

  const attachments = [];
  if (recipient === 'interviewer') {
    const resume = buildResumeAttachment(candidate);
    if (resume) attachments.push(resume);
  }

  const info = await transporter.sendMail({
    from: env.smtp.from,
    to,
    subject,
    text,
    html,
    ...(attachments.length ? { attachments } : {}),
  });
  logger.info('Reschedule approved email sent', {
    messageId: info.messageId,
    to,
    recipient,
    attachedResume: attachments.length > 0,
  });
  return info;
};

const sendRescheduleRejected = async ({ interview, candidate, interviewer, request }) => {
  const transporter = getTransporter();
  if (!transporter) throw new Error('SMTP not configured');

  const to = interviewer.email;
  const subject = `Reschedule request rejected — original schedule stands`;

  const html = buildRescheduleRejectedHtml({ candidate, interviewer, interview, request });
  const text = buildRescheduleRejectedText({ candidate, interviewer, interview, request });

  const info = await transporter.sendMail({ from: env.smtp.from, to, subject, text, html });
  logger.info('Reschedule rejected email sent', { messageId: info.messageId, to });
  return info;
};

const sendAccountSetup = async ({ interviewer, setupUrl, purpose, expiresAt }) => {
  const transporter = getTransporter();
  if (!transporter) throw new Error('SMTP not configured');
  if (!interviewer?.email) throw new Error('Interviewer email missing');

  const isReset = purpose === 'forgot_password';
  const subject = isReset ? `Reset your ${env.appName} password` : `Set up your ${env.appName} interviewer account`;
  const html = buildAccountSetupHtml({ name: interviewer.name, setupUrl, purpose, expiresAt, appName: env.appName });
  const text = buildAccountSetupText({ name: interviewer.name, setupUrl, purpose, expiresAt, appName: env.appName });

  const info = await transporter.sendMail({ from: env.smtp.from, to: interviewer.email, subject, text, html });
  logger.info('Account setup email sent', { messageId: info.messageId, to: interviewer.email, purpose });
  return info;
};

module.exports = {
  resolveHrEmail,
  sendInterviewReport,
  sendCandidateInvite,
  sendRound1Result,
  sendInterviewScheduled,
  sendRescheduleRequested,
  sendRescheduleApproved,
  sendRescheduleRejected,
  sendAccountSetup,
  getTransporter,
};
