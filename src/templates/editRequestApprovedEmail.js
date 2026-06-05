'use strict';

const escapeHtml = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const buildEditRequestApprovedHtml = ({ request, candidate, interviewer, dashboardUrl, decisionNote, appName }) => {
  const decisionBlock = decisionNote
    ? `<div style="margin-top:16px;padding:14px 16px;background:#f0fdf4;border-left:4px solid #16a34a;border-radius:6px">
        <div style="font-size:12px;color:#166534;font-weight:600;margin-bottom:6px">HR DECISION NOTE</div>
        <div style="color:#166534;white-space:pre-wrap">${escapeHtml(decisionNote)}</div>
      </div>`
    : '';

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f6f6f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#222">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f6;padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:white;border-radius:10px;overflow:hidden">
        <tr><td style="padding:24px 32px;background:#0f172a;color:white">
          <div style="font-size:13px;opacity:.85;letter-spacing:.06em;text-transform:uppercase">Edit Permission Granted</div>
          <div style="font-size:22px;margin-top:6px;font-weight:600">${escapeHtml(candidate.name || 'Candidate')}</div>
        </td></tr>
        <tr><td style="padding:24px 32px;line-height:1.6">
          <p style="margin:0 0 14px">Hi <strong>${escapeHtml(interviewer.name || 'Interviewer')}</strong>,</p>
          <p style="margin:0 0 14px">HR has approved your edit request for <strong>${escapeHtml(candidate.name || 'candidate')}</strong>'s review. You can now edit it from your interview detail page.</p>
          ${decisionBlock}
          <div style="text-align:center;margin:24px 0">
            <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;background:#2563eb;color:white;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">Open my interview page</a>
          </div>
        </td></tr>
        <tr><td style="padding:14px 32px;background:#fafafa;color:#94a3b8;font-size:12px;text-align:center">${escapeHtml(appName)}</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
};

const buildEditRequestApprovedText = ({ request, candidate, interviewer, dashboardUrl, decisionNote, appName }) => {
  let text = `Hi ${interviewer.name || 'Interviewer'},\n\nHR has approved your edit request for ${candidate.name || 'candidate'}'s review. You can now edit it from your interview detail page.\n`;

  if (decisionNote) {
    text += `\nHR Decision Note:\n${decisionNote}\n`;
  }

  text += `\nOpen my interview page: ${dashboardUrl}\n— ${appName}\n`;

  return text;
};

module.exports = { buildEditRequestApprovedHtml, buildEditRequestApprovedText };
