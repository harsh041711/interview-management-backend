'use strict';

const escapeHtml = (str) =>
  String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatAnswer = (given, type) => {
  if (given == null) return '<em>No answer</em>';
  if (Array.isArray(given)) return given.map(escapeHtml).join(', ');
  if (type === 'descriptive') return `<pre style="white-space:pre-wrap;font-family:inherit;margin:0">${escapeHtml(given)}</pre>`;
  return escapeHtml(given);
};

const formatCorrect = (q) => {
  if (q.type === 'multi_select' && Array.isArray(q.correctAnswer)) {
    return q.correctAnswer.map(escapeHtml).join(', ');
  }
  if (q.type === 'descriptive') return '<em>(AI-graded)</em>';
  return escapeHtml(q.correctAnswer || '—');
};

const renderAnswerRows = (submission) =>
  (submission.answers || [])
    .map((a, idx) => {
      const q = a.question || {};
      const correct = a.isCorrect
        ? '<span style="color:#1a8754;font-weight:600">Correct</span>'
        : '<span style="color:#c62828;font-weight:600">Incorrect</span>';
      return `
        <tr>
          <td style="padding:12px;border-bottom:1px solid #eee;vertical-align:top;width:36px;color:#666">${idx + 1}</td>
          <td style="padding:12px;border-bottom:1px solid #eee;vertical-align:top">
            <div style="font-weight:600;margin-bottom:6px">${escapeHtml(q.question || '')}</div>
            <div style="color:#666;font-size:13px;margin-bottom:8px">
              <span style="background:#eef;padding:2px 6px;border-radius:3px;margin-right:6px">${escapeHtml(q.type || '')}</span>
              <span>${escapeHtml(q.techStack || '')}</span> · <span>${escapeHtml(q.difficulty || '')}</span>
            </div>
            <div style="margin-bottom:6px"><strong>Candidate:</strong> ${formatAnswer(a.given, q.type)}</div>
            <div style="margin-bottom:6px"><strong>Expected:</strong> ${formatCorrect(q)}</div>
            ${a.aiFeedback ? `<div style="background:#fafaf3;padding:8px 10px;border-left:3px solid #f0c14b;margin-top:6px"><strong>AI Feedback (${escapeHtml(a.aiProvider || 'n/a')}):</strong> ${escapeHtml(a.aiFeedback)}</div>` : ''}
          </td>
          <td style="padding:12px;border-bottom:1px solid #eee;text-align:right;vertical-align:top;white-space:nowrap">
            <div>${correct}</div>
            <div style="color:#444;margin-top:4px">${a.score} / ${a.maxScore}</div>
          </td>
        </tr>`;
    })
    .join('');

const buildReportHtml = ({ candidate, submission }) => {
  const status = submission.cheatDetected
    ? '<span style="background:#c62828;color:white;padding:4px 10px;border-radius:4px">Cheat detected</span>'
    : submission.autoSubmitted
      ? '<span style="background:#ffa000;color:white;padding:4px 10px;border-radius:4px">Auto-submitted</span>'
      : '<span style="background:#1a8754;color:white;padding:4px 10px;border-radius:4px">Submitted</span>';

  const photo = candidate.photoUrl
    ? `<img src="${escapeHtml(candidate.photoUrl)}" alt="candidate" style="width:96px;height:96px;border-radius:50%;object-fit:cover;border:2px solid #eee" />`
    : '';

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f6f6f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#222">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f6;padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="background:white;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.06);overflow:hidden">
        <tr><td style="padding:24px 28px;background:#1f2937;color:white">
          <div style="font-size:13px;opacity:.8;letter-spacing:.06em;text-transform:uppercase">Interview Report</div>
          <div style="font-size:22px;margin-top:6px;font-weight:600">${escapeHtml(candidate.name)}</div>
          <div style="font-size:14px;opacity:.85;margin-top:2px">${escapeHtml(candidate.email)}</div>
        </td></tr>
        <tr><td style="padding:24px 28px">
          <table role="presentation" width="100%"><tr>
            <td style="vertical-align:top">
              <div style="margin-bottom:6px;color:#666;font-size:13px">Status</div>
              <div style="margin-bottom:14px">${status}</div>
              <div style="margin-bottom:6px;color:#666;font-size:13px">Tech Stack</div>
              <div style="margin-bottom:14px">${(candidate.techStack || []).map(escapeHtml).join(', ')}</div>
              <div style="margin-bottom:6px;color:#666;font-size:13px">Score</div>
              <div style="font-size:24px;font-weight:700">${submission.totalScore} / ${submission.maxScore} <span style="color:#666;font-size:14px;font-weight:500">(${submission.percentage}%)</span></div>
              ${submission.cheatReason ? `<div style="margin-top:10px;color:#c62828;font-size:13px"><strong>Cheat reason:</strong> ${escapeHtml(submission.cheatReason)}</div>` : ''}
            </td>
            <td style="vertical-align:top;text-align:right;width:120px">${photo}</td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:0 28px 12px"><h3 style="margin:0;color:#333;font-size:15px;border-bottom:2px solid #eee;padding-bottom:8px">Answer breakdown</h3></td></tr>
        <tr><td style="padding:0 16px 24px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${renderAnswerRows(submission)}</table>
        </td></tr>
        <tr><td style="padding:16px 28px;background:#fafafa;color:#666;font-size:12px;text-align:center">
          Generated by Interview Management System · ${new Date(submission.submittedAt || Date.now()).toUTCString()}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
};

const buildReportText = ({ candidate, submission }) => {
  const lines = [
    `Interview Report — ${candidate.name} <${candidate.email}>`,
    `Tech stack: ${(candidate.techStack || []).join(', ')}`,
    `Status: ${submission.cheatDetected ? 'Cheat detected' : submission.autoSubmitted ? 'Auto-submitted' : 'Submitted'}`,
    `Score: ${submission.totalScore} / ${submission.maxScore} (${submission.percentage}%)`,
    submission.cheatReason ? `Cheat reason: ${submission.cheatReason}` : null,
    '',
    'Answer breakdown:',
  ].filter(Boolean);
  (submission.answers || []).forEach((a, idx) => {
    const q = a.question || {};
    lines.push(`\n${idx + 1}. [${q.type || ''}] ${q.question || ''}`);
    lines.push(`   Score: ${a.score}/${a.maxScore} (${a.isCorrect ? 'correct' : 'incorrect'})`);
    if (a.aiFeedback) lines.push(`   AI: ${a.aiFeedback}`);
  });
  return lines.join('\n');
};

module.exports = { buildReportHtml, buildReportText };
