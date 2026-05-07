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

const buildScheduledHtml = ({
  recipient,
  candidate,
  interviewer,
  scheduledAt,
  durationMinutes,
  meetingUrl,
  accessUrl,
  notes,
  hasResume,
}) => {
  const isInterviewer = recipient === 'interviewer';
  const greeting = isInterviewer
    ? `Hi <strong>${escapeHtml(interviewer.name)}</strong>,`
    : `Hi <strong>${escapeHtml(candidate.name)}</strong>,`;

  const otherParty = isInterviewer
    ? `<p style="margin:0 0 14px">You have been assigned to interview <strong>${escapeHtml(candidate.name)}</strong> (${escapeHtml(candidate.email)}).</p>`
    : `<p style="margin:0 0 14px">Your Round 2 interview has been scheduled with <strong>${escapeHtml(interviewer.name)}</strong>.</p>`;

  const notesBlock =
    isInterviewer && notes
      ? `<div style="margin-top:20px;padding:14px 16px;background:#f0f9ff;border-left:4px solid #2563eb;border-radius:4px">
          <div style="font-size:13px;font-weight:600;color:#1e40af;margin-bottom:6px">HR Notes</div>
          <div style="color:#334155;font-size:14px;white-space:pre-wrap">${escapeHtml(notes)}</div>
        </div>`
      : '';

  const resumeBlock =
    isInterviewer && hasResume
      ? `<div style="margin-top:16px;padding:12px 16px;background:#f0fdf4;border-left:4px solid #16a34a;border-radius:4px;color:#166534;font-size:14px">
          The candidate's resume is attached to this email.
        </div>`
      : '';

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f6f6f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#222">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f6;padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.06);overflow:hidden">
        <tr><td style="padding:28px 32px;background:#0f172a;color:white">
          <div style="font-size:13px;opacity:.85;letter-spacing:.06em;text-transform:uppercase">Round 2 Interview</div>
          <div style="font-size:22px;margin-top:6px;font-weight:600">Interview Scheduled</div>
        </td></tr>
        <tr><td style="padding:28px 32px;line-height:1.6">
          <p style="margin:0 0 14px">${greeting}</p>
          ${otherParty}
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin:20px 0">
            <div style="margin-bottom:10px">
              <span style="color:#64748b;font-size:13px">Date &amp; Time</span><br>
              <strong>${escapeHtml(fmtDate(scheduledAt))}</strong><br>
              <span style="color:#94a3b8;font-size:12px">${escapeHtml(new Date(scheduledAt).toISOString())}</span>
            </div>
            <div>
              <span style="color:#64748b;font-size:13px">Duration</span><br>
              <strong>${escapeHtml(String(durationMinutes))} minutes</strong>
            </div>
          </div>

          <p style="margin:0 0 14px;color:#475569;font-size:14px">
            The meeting link will be available on your personal interview page. Open it using the button below.
          </p>

          <div style="text-align:center;margin:28px 0">
            <a href="${escapeHtml(accessUrl)}"
               style="display:inline-block;background:#2563eb;color:white;text-decoration:none;padding:13px 28px;border-radius:8px;font-weight:600;font-size:15px">
              Open my interview page
            </a>
          </div>

          <p style="margin:0 0 8px;color:#475569;font-size:13px">Or copy this URL into your browser:</p>
          <code style="display:block;background:#f1f5f9;padding:10px;border-radius:6px;font-size:12px;word-break:break-all;color:#334155">${escapeHtml(accessUrl)}</code>

          ${notesBlock}
          ${resumeBlock}

          <p style="margin:24px 0 0;color:#64748b;font-size:13px">
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

const buildScheduledText = ({
  recipient,
  candidate,
  interviewer,
  scheduledAt,
  durationMinutes,
  meetingUrl,
  accessUrl,
  notes,
  hasResume,
}) => {
  const isInterviewer = recipient === 'interviewer';
  const greeting = isInterviewer
    ? `Hi ${interviewer.name},`
    : `Hi ${candidate.name},`;

  const who = isInterviewer
    ? `You have been assigned to interview ${candidate.name} (${candidate.email}).`
    : `Your Round 2 interview has been scheduled with ${interviewer.name}.`;

  const notesSection =
    isInterviewer && notes ? `\nHR Notes:\n${notes}\n` : '';

  const resumeSection =
    isInterviewer && hasResume ? `\nThe candidate's resume is attached to this email.\n` : '';

  return `${greeting}

${who}

Interview details:
  Date & Time: ${fmtDate(scheduledAt)}
  ISO: ${new Date(scheduledAt).toISOString()}
  Duration: ${durationMinutes} minutes

Open your interview page to access the meeting link:
${accessUrl}
${notesSection}${resumeSection}
If you have any questions, please contact the HR team.
`;
};

module.exports = { buildScheduledHtml, buildScheduledText };
