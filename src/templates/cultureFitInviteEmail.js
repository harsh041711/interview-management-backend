'use strict';

const escapeHtml = (str) =>
  String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const buildCultureFitInviteHtml = ({ candidate, appName }) => `<!doctype html>
<html><body style="margin:0;padding:0;background:#f6f6f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#222">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f6;padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.06);overflow:hidden">
        <tr><td style="padding:28px 32px;background:#0f172a;color:white">
          <div style="font-size:13px;opacity:.85;letter-spacing:.06em;text-transform:uppercase">${escapeHtml(appName)}</div>
          <div style="font-size:22px;margin-top:6px;font-weight:600">You've Advanced!</div>
        </td></tr>
        <tr><td style="padding:28px 32px;line-height:1.7">
          <p style="margin:0 0 14px">Hi <strong>${escapeHtml(candidate.name)}</strong>,</p>
          <p style="margin:0 0 14px">
            Congratulations! You've been selected to move forward to the final culture-fit round of the
            <strong>${escapeHtml(appName)}</strong> interview process.
          </p>
          <p style="margin:0 0 14px">
            Our HR team will be reaching out shortly with further details about the next steps and scheduling.
            Please keep an eye on your inbox.
          </p>
          <p style="margin:24px 0 0;color:#64748b;font-size:13px">
            If you believe you received this email by mistake, please disregard it.
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px;background:#fafafa;color:#94a3b8;font-size:12px;text-align:center">
          Sent by ${escapeHtml(appName)} · ${new Date().toUTCString()}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

const buildCultureFitInviteText = ({ candidate, appName }) =>
  `Hi ${candidate.name},

Congratulations! You've been selected to move forward to the final culture-fit round of the ${appName} interview process.

Our HR team will be reaching out shortly with further details about the next steps and scheduling. Please keep an eye on your inbox.

Best regards,
${appName} Team
`;

module.exports = { buildCultureFitInviteHtml, buildCultureFitInviteText };
