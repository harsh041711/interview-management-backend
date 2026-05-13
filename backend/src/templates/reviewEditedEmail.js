'use strict';

const escapeHtml = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const fmtAvg = (r) => Math.round(((r.knowledge + r.communication + r.confidence) / 3) * 10) / 10;

const ratingRow = (label, value) => `
  <tr>
    <td style="padding:6px 8px;color:#475569;font-size:13px">${escapeHtml(label)}</td>
    <td style="padding:6px 8px;font-weight:600">${'★'.repeat(value)}<span style="color:#cbd5e1">${'★'.repeat(5 - value)}</span> <span style="color:#64748b;font-size:13px">${value}/5</span></td>
  </tr>`;

const buildReviewEditedHtml = ({ review, candidate, interviewer, adminUrl, appName }) => {
  const avg = fmtAvg(review.ratings);
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f6f6f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#222">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f6;padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:white;border-radius:10px;overflow:hidden">
        <tr><td style="padding:24px 32px;background:#0f172a;color:white">
          <div style="font-size:13px;opacity:.85;letter-spacing:.06em;text-transform:uppercase">Review Updated</div>
          <div style="font-size:22px;margin-top:6px;font-weight:600">${escapeHtml(candidate.name)} — ${avg}/5<span style="color:#f59e0b;font-size:13px;margin-left:6px">(edit #${review.editCount})</span></div>
        </td></tr>
        <tr><td style="padding:24px 32px;line-height:1.6">
          <p style="margin:0 0 14px"><strong>${escapeHtml(interviewer.name)}</strong> updated the review for <strong>${escapeHtml(candidate.name)}</strong>.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;width:100%">
            ${ratingRow('Knowledge', review.ratings.knowledge)}
            ${ratingRow('Communication', review.ratings.communication)}
            ${ratingRow('Confidence', review.ratings.confidence)}
            <tr><td style="padding:10px 8px;border-top:1px solid #e2e8f0;color:#475569;font-size:13px">Average</td><td style="padding:10px 8px;border-top:1px solid #e2e8f0;font-weight:700;font-size:16px">${avg}/5</td></tr>
          </table>
          <div style="margin-top:16px;padding:14px 16px;background:#f1f5f9;border-radius:6px">
            <div style="font-size:12px;color:#64748b;margin-bottom:6px">COMMENTS</div>
            <div style="white-space:pre-wrap">${escapeHtml(review.comments)}</div>
          </div>
          <div style="text-align:center;margin:24px 0">
            <a href="${escapeHtml(adminUrl)}" style="display:inline-block;background:#2563eb;color:white;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">View candidate</a>
          </div>
        </td></tr>
        <tr><td style="padding:14px 32px;background:#fafafa;color:#94a3b8;font-size:12px;text-align:center">${escapeHtml(appName)}</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
};

const buildReviewEditedText = ({ review, candidate, interviewer, adminUrl, appName }) => {
  const avg = fmtAvg(review.ratings);
  return `Review updated by ${interviewer.name} for ${candidate.name} (edit #${review.editCount}).

Average: ${avg}/5
  Knowledge:     ${review.ratings.knowledge}/5
  Communication: ${review.ratings.communication}/5
  Confidence:    ${review.ratings.confidence}/5

Comments:
${review.comments}

View candidate: ${adminUrl}
— ${appName}
`;
};

module.exports = { buildReviewEditedHtml, buildReviewEditedText };
