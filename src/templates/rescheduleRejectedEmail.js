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

const buildRescheduleRejectedHtml = ({ candidate, interviewer, interview, request }) => {
  const noteBlock = request.decisionNote
    ? `<div style="margin-top:16px;padding:12px 16px;background:#fef2f2;border-left:4px solid #dc2626;border-radius:4px">
        <div style="font-size:13px;font-weight:600;color:#b91c1c;margin-bottom:4px">HR Decision Note</div>
        <div style="color:#334155;font-size:14px">${escapeHtml(request.decisionNote)}</div>
      </div>`
    : '';

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f6f6f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#222">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f6;padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.06);overflow:hidden">
        <tr><td style="padding:28px 32px;background:#7f1d1d;color:white">
          <div style="font-size:13px;opacity:.85;letter-spacing:.06em;text-transform:uppercase">Reschedule Rejected</div>
          <div style="font-size:22px;margin-top:6px;font-weight:600">Original schedule stands</div>
        </td></tr>
        <tr><td style="padding:28px 32px;line-height:1.6">
          <p style="margin:0 0 14px">Hi <strong>${escapeHtml(interviewer.name)}</strong>,</p>
          <p style="margin:0 0 14px">Your reschedule request for the interview with <strong>${escapeHtml(candidate.name)}</strong> has been <strong style="color:#dc2626">rejected</strong>. The original schedule remains in place.</p>

          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin:20px 0">
            <div style="margin-bottom:10px">
              <span style="color:#64748b;font-size:13px">Interview Date &amp; Time</span><br>
              <strong>${escapeHtml(fmtDate(interview.scheduledAt))}</strong>
            </div>
            <div>
              <span style="color:#64748b;font-size:13px">Duration</span><br>
              <strong>${escapeHtml(String(interview.durationMinutes))} minutes</strong>
            </div>
          </div>

          ${noteBlock}

          <p style="margin:24px 0 0;color:#64748b;font-size:13px">
            Please contact HR if you have concerns about the scheduled time.
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

const buildRescheduleRejectedText = ({ candidate, interviewer, interview, request }) =>
  `Hi ${interviewer.name},

Your reschedule request for the interview with ${candidate.name} has been rejected. The original schedule remains in place.

  Interview Date & Time: ${fmtDate(interview.scheduledAt)}
  Duration: ${interview.durationMinutes} minutes
${request.decisionNote ? `\nHR Decision Note: ${request.decisionNote}\n` : ''}
Please contact HR if you have concerns about the scheduled time.
`;

module.exports = { buildRescheduleRejectedHtml, buildRescheduleRejectedText };
