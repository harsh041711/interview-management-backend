'use strict';

const escapeHtml = (str) =>
  String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const buildShortlistedHtml = ({ candidate, appName }) => `<!doctype html>
<html><body style="margin:0;padding:0;background:#f6f6f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#222">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f6;padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.06);overflow:hidden">
        <tr><td style="padding:28px 32px;background:#14532d;color:white">
          <div style="font-size:13px;opacity:.85;letter-spacing:.06em;text-transform:uppercase">${escapeHtml(appName)}</div>
          <div style="font-size:22px;margin-top:6px;font-weight:600">You've Cleared the MCQ Assessment</div>
        </td></tr>
        <tr><td style="padding:28px 32px;line-height:1.7">
          <p style="margin:0 0 14px">Hi <strong>${escapeHtml(candidate.name)}</strong>,</p>
          <p style="margin:0 0 14px">
            Great news — you've successfully cleared the MCQ assessment for the
            <strong>${escapeHtml(appName)}</strong> interview process.
          </p>
          <p style="margin:0 0 14px">
            The next step is a <strong>coding challenge</strong>. Our team is preparing it now;
            you'll receive a separate invitation email with your test link shortly.
          </p>
          <p style="margin:0 0 14px">
            Please keep an eye on your inbox over the next 24–48 hours and make sure
            your contact information is up to date.
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

const buildShortlistedText = ({ candidate, appName }) =>
  `Hi ${candidate.name},

Great news — you've successfully cleared the MCQ assessment for the ${appName} interview process.

The next step is a coding challenge. Our team is preparing it now; you'll receive a separate invitation email with your test link shortly.

Please keep an eye on your inbox over the next 24-48 hours and make sure your contact information is up to date.

Best regards,
${appName} Team
`;

module.exports = { buildShortlistedHtml, buildShortlistedText };
