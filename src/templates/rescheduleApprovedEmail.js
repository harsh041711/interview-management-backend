'use strict';

const escapeHtml = (str) =>
  String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const fmtDate = (date) => {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
};

const buildRescheduleApprovedHtml = ({
  recipient,
  candidate,
  interviewer,
  interview,
  accessUrl,
  decisionNote,
}) => {
  const isInterviewer = recipient === 'interviewer';
  const name = isInterviewer ? interviewer.name : candidate.name;

  const noteBlock = decisionNote
    ? `<div style="margin-top:16px;padding:12px 16px;background:#f0fdf4;border-left:4px solid #16a34a;border-radius:4px">
        <div style="font-size:13px;font-weight:600;color:#15803d;margin-bottom:4px">HR Note</div>
        <div style="color:#334155;font-size:14px">${escapeHtml(decisionNote)}</div>
      </div>`
    : '';

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f6f6f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#222">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f6;padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.06);overflow:hidden">
        <tr><td style="padding:28px 32px;background:#14532d;color:white">
          <div style="font-size:13px;opacity:.85;letter-spacing:.06em;text-transform:uppercase">Reschedule Approved</div>
          <div style="font-size:22px;margin-top:6px;font-weight:600">Your interview has been rescheduled</div>
        </td></tr>
        <tr><td style="padding:28px 32px;line-height:1.6">
          <p style="margin:0 0 14px">Hi <strong>${escapeHtml(name)}</strong>,</p>
          <p style="margin:0 0 14px">The reschedule request has been <strong style="color:#16a34a">approved</strong>. Your interview is now scheduled for:</p>

          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin:20px 0">
            <div style="margin-bottom:10px">
              <span style="color:#64748b;font-size:13px">New Date &amp; Time</span><br>
              <strong>${escapeHtml(fmtDate(interview.scheduledAt))}</strong><br>
              <span style="color:#94a3b8;font-size:12px">${escapeHtml(new Date(interview.scheduledAt).toISOString())}</span>
            </div>
            <div>
              <span style="color:#64748b;font-size:13px">Duration</span><br>
              <strong>${escapeHtml(String(interview.durationMinutes))} minutes</strong>
            </div>
          </div>

          ${noteBlock}

          <div style="text-align:center;margin:28px 0">
            <a href="${escapeHtml(accessUrl)}"
               style="display:inline-block;background:#2563eb;color:white;text-decoration:none;padding:13px 28px;border-radius:8px;font-weight:600;font-size:15px">
              Open my interview page
            </a>
          </div>

          <p style="margin:0;color:#64748b;font-size:13px">
            If you have any questions, please contact the HR team.
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px;background:#fafafa;color:#94a3b8;font-size:12px;text-align:center">
          Interview Management System · ${new Date().toUTCString()}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
};

const buildRescheduleApprovedText = ({
  recipient,
  candidate,
  interviewer,
  interview,
  accessUrl,
  decisionNote,
}) => {
  const isInterviewer = recipient === 'interviewer';
  const name = isInterviewer ? interviewer.name : candidate.name;

  return `Hi ${name},

The reschedule request has been approved. Your interview is now scheduled for:

  New Date & Time: ${fmtDate(interview.scheduledAt)}
  Duration: ${interview.durationMinutes} minutes
${decisionNote ? `\nHR Note: ${decisionNote}\n` : ''}
Open your interview page:
${accessUrl}
`;
};

module.exports = { buildRescheduleApprovedHtml, buildRescheduleApprovedText };
