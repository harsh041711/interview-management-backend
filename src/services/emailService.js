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
const { buildReviewSubmittedHtml, buildReviewSubmittedText } = require('../templates/reviewSubmittedEmail');
const { buildReviewEditedHtml, buildReviewEditedText } = require('../templates/reviewEditedEmail');
const { buildEditRequestSubmittedHtml, buildEditRequestSubmittedText } = require('../templates/editRequestSubmittedEmail');
const { buildEditRequestApprovedHtml, buildEditRequestApprovedText } = require('../templates/editRequestApprovedEmail');
const { buildEditRequestRejectedHtml, buildEditRequestRejectedText } = require('../templates/editRequestRejectedEmail');
const { buildCultureFitInviteHtml, buildCultureFitInviteText } = require('../templates/cultureFitInviteEmail');
const { buildFinalRejectionHtml, buildFinalRejectionText } = require('../templates/finalRejectionEmail');
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

const sendInterviewScheduled = async ({ recipient, interview, candidate, interviewer, accessUrl, setupUrl }) => {
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
    setupUrl,
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
    setupUrl,
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

const sendReviewSubmitted = async ({ review, candidate, interviewer }) => {
  const transporter = getTransporter();
  if (!transporter) throw new Error('SMTP not configured');
  const hrTo = await resolveHrEmail();
  if (!hrTo) throw new Error('No HR email recipient configured');

  const baseUrl = env.frontendUrl.replace(/\/$/, '');
  const candidateId = candidate.id || candidate._id;
  const adminUrl = `${baseUrl}/candidates/${candidateId}`;
  const avg = Math.round(((review.ratings.knowledge + review.ratings.communication + review.ratings.confidence) / 3) * 10) / 10;

  const subject = `Review submitted — ${candidate.name} (${avg}/5)`;
  const html = buildReviewSubmittedHtml({ review, candidate, interviewer, adminUrl, appName: env.appName });
  const text = buildReviewSubmittedText({ review, candidate, interviewer, adminUrl, appName: env.appName });

  const info = await transporter.sendMail({ from: env.smtp.from, to: hrTo, subject, text, html });
  logger.info('Review submitted email sent', { messageId: info.messageId, to: hrTo, candidate: candidateId });
  return info;
};

const sendReviewEdited = async ({ review, candidate, interviewer }) => {
  const transporter = getTransporter();
  if (!transporter) throw new Error('SMTP not configured');
  const hrTo = await resolveHrEmail();
  if (!hrTo) throw new Error('No HR email recipient configured');

  const baseUrl = env.frontendUrl.replace(/\/$/, '');
  const candidateId = candidate.id || candidate._id;
  const adminUrl = `${baseUrl}/candidates/${candidateId}`;

  const subject = `Review updated — ${candidate.name}`;
  const html = buildReviewEditedHtml({ review, candidate, interviewer, adminUrl, appName: env.appName });
  const text = buildReviewEditedText({ review, candidate, interviewer, adminUrl, appName: env.appName });

  const info = await transporter.sendMail({ from: env.smtp.from, to: hrTo, subject, text, html });
  logger.info('Review edited email sent', { messageId: info.messageId, to: hrTo, candidate: candidateId });
  return info;
};

const sendEditRequestSubmitted = async ({ request }) => {
  const transporter = getTransporter();
  if (!transporter) throw new Error('SMTP not configured');
  const hrTo = await resolveHrEmail();
  if (!hrTo) throw new Error('No HR email recipient configured');

  const review = request.review;
  const candidate = review?.candidate || {};
  const interviewer = review?.interviewer || {};

  const baseUrl = env.frontendUrl.replace(/\/$/, '');
  const adminUrl = `${baseUrl}/admin/review-edit-requests`;

  const subject = `Edit request — ${interviewer.name || 'Interviewer'} for ${candidate.name || 'Candidate'}`;
  const html = buildEditRequestSubmittedHtml({ request, candidate, interviewer, adminUrl, appName: env.appName });
  const text = buildEditRequestSubmittedText({ request, candidate, interviewer, adminUrl, appName: env.appName });

  const info = await transporter.sendMail({ from: env.smtp.from, to: hrTo, subject, text, html });
  logger.info('Edit-request email sent', { messageId: info.messageId, to: hrTo });
  return info;
};

const sendEditRequestApproved = async ({ request }) => {
  const transporter = getTransporter();
  if (!transporter) throw new Error('SMTP not configured');
  const review = request.review;
  const candidate = review?.candidate || {};
  const interviewer = review?.interviewer || {};
  if (!interviewer.email) throw new Error('Interviewer email missing');

  const baseUrl = env.frontendUrl.replace(/\/$/, '');
  const dashboardUrl = `${baseUrl}/interviewer/dashboard`;

  const subject = `Edit permission granted`;
  const html = buildEditRequestApprovedHtml({
    request, candidate, interviewer, dashboardUrl,
    decisionNote: request.decisionNote || null, appName: env.appName,
  });
  const text = buildEditRequestApprovedText({
    request, candidate, interviewer, dashboardUrl,
    decisionNote: request.decisionNote || null, appName: env.appName,
  });

  const info = await transporter.sendMail({ from: env.smtp.from, to: interviewer.email, subject, text, html });
  logger.info('Edit-request approved email sent', { messageId: info.messageId, to: interviewer.email });
  return info;
};

const sendEditRequestRejected = async ({ request }) => {
  const transporter = getTransporter();
  if (!transporter) throw new Error('SMTP not configured');
  const review = request.review;
  const candidate = review?.candidate || {};
  const interviewer = review?.interviewer || {};
  if (!interviewer.email) throw new Error('Interviewer email missing');

  const subject = `Edit request not approved`;
  const html = buildEditRequestRejectedHtml({
    request, candidate, interviewer,
    decisionNote: request.decisionNote || null, appName: env.appName,
  });
  const text = buildEditRequestRejectedText({
    request, candidate, interviewer,
    decisionNote: request.decisionNote || null, appName: env.appName,
  });

  const info = await transporter.sendMail({ from: env.smtp.from, to: interviewer.email, subject, text, html });
  logger.info('Edit-request rejected email sent', { messageId: info.messageId, to: interviewer.email });
  return info;
};

const sendCultureFitInvite = async ({ candidate }) => {
  const transporter = getTransporter();
  if (!transporter) throw new Error('SMTP not configured');
  if (!candidate?.email) throw new Error('Candidate email is missing');

  const subject = `You've advanced — ${env.appName} final culture-fit round`;
  const html = buildCultureFitInviteHtml({ candidate, appName: env.appName });
  const text = buildCultureFitInviteText({ candidate, appName: env.appName });

  const info = await transporter.sendMail({ from: env.smtp.from, to: candidate.email, subject, text, html });
  logger.info('Culture-fit invite sent', { messageId: info.messageId, to: candidate.email });
  return info;
};

const sendFinalRejection = async ({ candidate, note }) => {
  const transporter = getTransporter();
  if (!transporter) throw new Error('SMTP not configured');
  if (!candidate?.email) throw new Error('Candidate email is missing');

  const subject = `Update on your ${env.appName} application`;
  const html = buildFinalRejectionHtml({ candidate, note: note || null, appName: env.appName });
  const text = buildFinalRejectionText({ candidate, note: note || null, appName: env.appName });

  const info = await transporter.sendMail({ from: env.smtp.from, to: candidate.email, subject, text, html });
  logger.info('Final rejection sent', { messageId: info.messageId, to: candidate.email });
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
  sendReviewSubmitted,
  sendReviewEdited,
  sendEditRequestSubmitted,
  sendEditRequestApproved,
  sendEditRequestRejected,
  sendCultureFitInvite,
  sendFinalRejection,
  getTransporter,
};
