'use strict';

const escapeHtml = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const buildAccountSetupHtml = ({ name, setupUrl, purpose, expiresAt, appName }) => {
  const isReset = purpose === 'forgot_password';
  const headline = isReset ? 'Reset your password' : 'Set up your interviewer account';
  const intro = isReset
    ? `We received a request to reset your password for ${escapeHtml(appName)}.`
    : `HR has invited you to the ${escapeHtml(appName)} interviewer portal. Click below to set your password.`;

  return `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f6f6f6;margin:0;padding:24px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:white;border-radius:10px">
        <tr><td style="padding:28px 32px;background:#0f172a;color:white;border-top-left-radius:10px;border-top-right-radius:10px">
          <div style="font-size:22px;font-weight:600">${headline}</div>
        </td></tr>
        <tr><td style="padding:28px 32px;line-height:1.6;color:#222">
          <p>Hi <strong>${escapeHtml(name)}</strong>,</p>
          <p>${intro}</p>
          <div style="text-align:center;margin:28px 0">
            <a href="${escapeHtml(setupUrl)}"
               style="display:inline-block;background:#2563eb;color:white;text-decoration:none;padding:13px 28px;border-radius:8px;font-weight:600">
              ${isReset ? 'Reset password' : 'Set my password'}
            </a>
          </div>
          <p style="color:#475569;font-size:13px">Or copy this URL into your browser:</p>
          <code style="display:block;background:#f1f5f9;padding:10px;border-radius:6px;font-size:12px;word-break:break-all">${escapeHtml(setupUrl)}</code>
          <p style="color:#64748b;font-size:13px;margin-top:18px">This link expires at <strong>${new Date(expiresAt).toLocaleString()}</strong>. If you didn't request this, you can safely ignore the email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
};

const buildAccountSetupText = ({ name, setupUrl, purpose, expiresAt, appName }) => {
  const isReset = purpose === 'forgot_password';
  return `Hi ${name},

${isReset
    ? `We received a request to reset your password for ${appName}.`
    : `HR has invited you to the ${appName} interviewer portal.`}

${isReset ? 'Reset your password:' : 'Set your password:'}
${setupUrl}

This link expires at ${new Date(expiresAt).toLocaleString()}.
If you didn't request this, ignore this email.
`;
};

module.exports = { buildAccountSetupHtml, buildAccountSetupText };
