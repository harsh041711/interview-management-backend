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

const buildRescheduleRequestedHtml = ({ interview, request, candidate, interviewer, adminUrl }) => `<!doctype html>
<html><body style="margin:0;padding:0;background:#f6f6f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#222">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f6;padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.06);overflow:hidden">
        <tr><td style="padding:28px 32px;background:#92400e;color:white">
          <div style="font-size:13px;opacity:.85;letter-spacing:.06em;text-transform:uppercase">Action Required</div>
          <div style="font-size:22px;margin-top:6px;font-weight:600">Reschedule Request</div>
        </td></tr>
        <tr><td style="padding:28px 32px;line-height:1.6">
          <p style="margin:0 0 14px">The interviewer <strong>${escapeHtml(interviewer.name)}</strong> has requested to reschedule the interview with <strong>${escapeHtml(candidate.name)}</strong>.</p>

          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin:20px 0">
            <div style="margin-bottom:12px">
              <span style="color:#64748b;font-size:13px">Original Schedule</span><br>
              <strong>${escapeHtml(fmtDate(interview.scheduledAt))}</strong>
            </div>
            <div style="margin-bottom:12px">
              <span style="color:#64748b;font-size:13px">Proposed New Time</span><br>
              <strong style="color:#1d4ed8">${escapeHtml(fmtDate(request.proposedAt))}</strong>
              ${request.proposedDurationMinutes ? `<br><span style="color:#64748b;font-size:13px">New duration: ${escapeHtml(String(request.proposedDurationMinutes))} minutes</span>` : ''}
            </div>
            ${request.reason ? `<div>
              <span style="color:#64748b;font-size:13px">Reason</span><br>
              <span style="color:#334155">${escapeHtml(request.reason)}</span>
            </div>` : ''}
          </div>

          <div style="text-align:center;margin:28px 0">
            <a href="${escapeHtml(adminUrl)}"
               style="display:inline-block;background:#1d4ed8;color:white;text-decoration:none;padding:13px 28px;border-radius:8px;font-weight:600;font-size:15px">
              Review &amp; Decide
            </a>
          </div>

          <p style="margin:0;color:#64748b;font-size:13px">
            Log in to the admin panel to approve or reject this reschedule request.
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px;background:#fafafa;color:#94a3b8;font-size:12px;text-align:center">
          Interview Management System · ${new Date().toUTCString()}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

const buildRescheduleRequestedText = ({ interview, request, candidate, interviewer, adminUrl }) =>
  `Action Required: Reschedule Request

${interviewer.name} has requested to reschedule the interview with ${candidate.name}.

Original Schedule: ${fmtDate(interview.scheduledAt)}
Proposed New Time: ${fmtDate(request.proposedAt)}${request.proposedDurationMinutes ? `\nNew Duration: ${request.proposedDurationMinutes} minutes` : ''}
${request.reason ? `Reason: ${request.reason}` : ''}

Review and decide:
${adminUrl}
`;

module.exports = { buildRescheduleRequestedHtml, buildRescheduleRequestedText };
