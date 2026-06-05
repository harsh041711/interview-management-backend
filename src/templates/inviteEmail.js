'use strict';

const escapeHtml = (str) =>
  String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const fmtExpiry = (date) => {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  return d.toUTCString();
};

const buildInviteHtml = ({ candidate, testUrl, appName, expiresAt }) => `<!doctype html>
<html><body style="margin:0;padding:0;background:#f6f6f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#222">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f6;padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.06);overflow:hidden">
        <tr><td style="padding:28px 32px;background:#0f172a;color:white">
          <div style="font-size:13px;opacity:.85;letter-spacing:.06em;text-transform:uppercase">${escapeHtml(appName)}</div>
          <div style="font-size:22px;margin-top:6px;font-weight:600">You're invited to a technical interview</div>
        </td></tr>
        <tr><td style="padding:28px 32px;line-height:1.6">
          <p style="margin:0 0 14px">Hi <strong>${escapeHtml(candidate.name)}</strong>,</p>
          <p style="margin:0 0 14px">
            Thanks for applying. We'd like you to take a short timed assessment for
            <strong>${(candidate.techStack || []).map(escapeHtml).join(', ')}</strong>. The test consists of
            <strong>${candidate.questionCount}</strong> question${candidate.questionCount === 1 ? '' : 's'}
            and you'll have <strong>${candidate.durationMinutes}</strong> minute${candidate.durationMinutes === 1 ? '' : 's'} to complete it once you start.
          </p>

          <div style="text-align:center;margin:28px 0">
            <a href="${escapeHtml(testUrl)}"
               style="display:inline-block;background:#2563eb;color:white;text-decoration:none;padding:13px 28px;border-radius:8px;font-weight:600;font-size:15px">
              Start your test
            </a>
          </div>

          <p style="margin:0 0 8px;color:#475569;font-size:13px">Or copy and paste this URL into your browser:</p>
          <code style="display:block;background:#f1f5f9;padding:10px;border-radius:6px;font-size:12px;word-break:break-all;color:#334155">${escapeHtml(testUrl)}</code>

          <h3 style="font-size:14px;color:#1f2937;margin:28px 0 10px">Before you start, please note:</h3>
          <ul style="margin:0 0 16px;padding-left:18px;color:#475569;font-size:14px">
            <li>You'll be asked to capture a webcam photo for verification.</li>
            <li>Switching tabs or leaving the window will <strong>auto-submit</strong> your test.</li>
            <li>The link expires on <strong>${escapeHtml(fmtExpiry(expiresAt))}</strong> — please complete the test before then.</li>
            <li>Use a desktop or laptop with a stable internet connection.</li>
          </ul>

          <p style="margin:24px 0 0;color:#64748b;font-size:13px">
            If you weren't expecting this email, you can safely ignore it.
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px;background:#fafafa;color:#94a3b8;font-size:12px;text-align:center">
          Sent by ${escapeHtml(appName)} · ${new Date().toUTCString()}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

const buildInviteText = ({ candidate, testUrl, appName, expiresAt }) => `Hi ${candidate.name},

You're invited to a technical interview via ${appName}.

Tech stack: ${(candidate.techStack || []).join(', ')}
Questions: ${candidate.questionCount}
Duration: ${candidate.durationMinutes} minute(s) once started
Link expires: ${fmtExpiry(expiresAt)}

Start your test:
${testUrl}

Notes:
- You'll be asked to capture a webcam photo before the test.
- Switching tabs or leaving the window will auto-submit your test.
- Use a desktop or laptop with a stable internet connection.

If you weren't expecting this email, you can safely ignore it.
`;

module.exports = { buildInviteHtml, buildInviteText };
