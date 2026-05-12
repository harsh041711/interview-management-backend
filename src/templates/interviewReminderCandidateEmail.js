'use strict';

const formatDateTime = (dt) => new Date(dt).toLocaleString('en-US', {
  weekday: 'short', month: 'short', day: 'numeric',
  hour: 'numeric', minute: '2-digit', hour12: true,
});

const buildCandidateReminderHtml = ({ interview, candidate, interviewer }) => `
<!doctype html>
<html><body style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:600px;margin:auto;padding:24px">
  <h2 style="color:#2563eb">Reminder: your interview starts in 30 minutes</h2>
  <p>Hi ${candidate.name},</p>
  <p>This is a friendly reminder that your interview is scheduled to begin shortly.</p>
  <table style="border-collapse:collapse;margin:16px 0;font-size:14px">
    <tr><td style="padding:6px 12px 6px 0;color:#6b7280">When</td><td><strong>${formatDateTime(interview.scheduledAt)}</strong></td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#6b7280">Duration</td><td>${interview.durationMinutes} minutes</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#6b7280">Interviewer</td><td>${interviewer?.name || '—'}</td></tr>
  </table>
  ${interview.meetingUrl
    ? `<p><a href="${interview.meetingUrl}" style="display:inline-block;background:#2563eb;color:white;padding:10px 20px;border-radius:6px;text-decoration:none">Join meeting</a></p>`
    : '<p>Your interviewer will share the meeting link shortly.</p>'}
  <p style="color:#6b7280;font-size:13px">Tip: join a couple of minutes early to check audio and video. Good luck!</p>
</body></html>`;

const buildCandidateReminderText = ({ interview, candidate, interviewer }) =>
  `Hi ${candidate.name},

Reminder: your interview starts in 30 minutes.

When:         ${formatDateTime(interview.scheduledAt)}
Duration:     ${interview.durationMinutes} minutes
Interviewer:  ${interviewer?.name || '—'}
${interview.meetingUrl ? `Meeting link: ${interview.meetingUrl}` : 'Your interviewer will share the meeting link shortly.'}

Tip: join a couple of minutes early to check audio and video. Good luck!`;

module.exports = { buildCandidateReminderHtml, buildCandidateReminderText };
