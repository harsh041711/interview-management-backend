'use strict';

const escapeHtml = (str) =>
  String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const buildRejectedHtml = ({ candidate, appName }) => `<!doctype html>
<html><body style="margin:0;padding:0;background:#f6f6f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#222">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f6;padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.06);overflow:hidden">
        <tr><td style="padding:28px 32px;background:#0f172a;color:white">
          <div style="font-size:13px;opacity:.85;letter-spacing:.06em;text-transform:uppercase">${escapeHtml(appName)}</div>
          <div style="font-size:22px;margin-top:6px;font-weight:600">Assessment Update</div>
        </td></tr>
        <tr><td style="padding:28px 32px;line-height:1.7">
          <p style="margin:0 0 14px">Hi <strong>${escapeHtml(candidate.name)}</strong>,</p>
          <p style="margin:0 0 14px">
            Thank you for taking the time to complete the assessment for <strong>${escapeHtml(appName)}</strong>.
          </p>
          <p style="margin:0 0 14px">
            After reviewing your submission, we won't be moving forward with your application at this time.
            We wish you the very best in your search and in your future endeavours.
          </p>
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

const buildRejectedText = ({ candidate, appName }) =>
  `Hi ${candidate.name},

Thank you for taking the time to complete the assessment for ${appName}.

After reviewing your submission, we won't be moving forward with your application at this time. We wish you the very best in your search and in your future endeavours.

Best regards,
${appName} Team
`;

module.exports = { buildRejectedHtml, buildRejectedText };
