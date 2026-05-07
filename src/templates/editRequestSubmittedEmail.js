'use strict';

const escapeHtml = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const buildEditRequestSubmittedHtml = ({ request, candidate, interviewer, adminUrl, appName }) => {
  const reasonBlock = request.reason
    ? `<div style="margin-top:16px;padding:14px 16px;background:#f1f5f9;border-radius:6px">
        <div style="font-size:12px;color:#64748b;margin-bottom:6px">REASON</div>
        <div style="white-space:pre-wrap">${escapeHtml(request.reason)}</div>
      </div>`
    : '';

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f6f6f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#222">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f6;padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:white;border-radius:10px;overflow:hidden">
        <tr><td style="padding:24px 32px;background:#0f172a;color:white">
          <div style="font-size:13px;opacity:.85;letter-spacing:.06em;text-transform:uppercase">Edit Request</div>
          <div style="font-size:22px;margin-top:6px;font-weight:600">${escapeHtml(interviewer.name || 'Interviewer')} for ${escapeHtml(candidate.name || 'Candidate')}</div>
        </td></tr>
        <tr><td style="padding:24px 32px;line-height:1.6">
          <p style="margin:0 0 14px"><strong>${escapeHtml(interviewer.name || 'An interviewer')}</strong> would like to edit the review for <strong>${escapeHtml(candidate.name || 'candidate')}</strong>.</p>
          ${reasonBlock}
          <div style="text-align:center;margin:24px 0">
            <a href="${escapeHtml(adminUrl)}" style="display:inline-block;background:#2563eb;color:white;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">Review request</a>
          </div>
        </td></tr>
        <tr><td style="padding:14px 32px;background:#fafafa;color:#94a3b8;font-size:12px;text-align:center">${escapeHtml(appName)}</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
};

const buildEditRequestSubmittedText = ({ request, candidate, interviewer, adminUrl, appName }) => {
  let text = `Edit request from ${interviewer.name || 'Interviewer'} for ${candidate.name || 'candidate'}'s review.\n`;

  if (request.reason) {
    text += `\nReason:\n${request.reason}\n`;
  }

  text += `\nReview request: ${adminUrl}\n— ${appName}\n`;

  return text;
};

module.exports = { buildEditRequestSubmittedHtml, buildEditRequestSubmittedText };
