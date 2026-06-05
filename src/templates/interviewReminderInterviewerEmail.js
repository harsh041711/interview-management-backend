'use strict';

const formatDateTime = (dt) => new Date(dt).toLocaleString('en-US', {
  weekday: 'short', month: 'short', day: 'numeric',
  hour: 'numeric', minute: '2-digit', hour12: true,
});

const buildInterviewerReminderHtml = ({ interview, candidate, interviewer }) => `
<!doctype html>
<html><body style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:600px;margin:auto;padding:24px">
  <h2 style="color:#2563eb">Reminder: interview with ${candidate.name} starts in 30 minutes</h2>
  <p>Hi ${interviewer.name},</p>
  <p>Your interview is scheduled to begin shortly.</p>
  <table style="border-collapse:collapse;margin:16px 0;font-size:14px">
    <tr><td style="padding:6px 12px 6px 0;color:#6b7280">When</td><td><strong>${formatDateTime(interview.scheduledAt)}</strong></td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#6b7280">Duration</td><td>${interview.durationMinutes} minutes</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#6b7280">Candidate</td><td>${candidate.name} (${candidate.email})</td></tr>
    ${candidate.resumeUrl ? `<tr><td style="padding:6px 12px 6px 0;color:#6b7280">Resume</td><td><a href="${candidate.resumeUrl}">Download</a></td></tr>` : ''}
  </table>
  ${interview.meetingUrl
    ? `<p><a href="${interview.meetingUrl}" style="display:inline-block;background:#2563eb;color:white;padding:10px 20px;border-radius:6px;text-decoration:none">Join meeting</a></p>`
    : ''}
  ${interview.notes ? `<p style="background:#f9fafb;padding:10px;border-radius:6px;font-size:13px"><strong>HR notes:</strong> ${interview.notes}</p>` : ''}
</body></html>`;

const buildInterviewerReminderText = ({ interview, candidate, interviewer }) =>
  `Hi ${interviewer.name},

Reminder: your interview with ${candidate.name} starts in 30 minutes.

When:      ${formatDateTime(interview.scheduledAt)}
Duration:  ${interview.durationMinutes} minutes
Candidate: ${candidate.name} (${candidate.email})
${candidate.resumeUrl ? `Resume:    ${candidate.resumeUrl}\n` : ''}${interview.meetingUrl ? `Meeting:   ${interview.meetingUrl}` : ''}${interview.notes ? `\n\nHR notes: ${interview.notes}` : ''}`;

module.exports = { buildInterviewerReminderHtml, buildInterviewerReminderText };
