'use strict';

const buildCodingSubmissionReceivedHtml = ({ candidate, submissions, adminUrl }) => {
  const passedTotal = submissions.reduce((sum, s) => sum + (s.passedCount || 0), 0);
  const totalTotal = submissions.reduce((sum, s) => sum + (s.totalCount || 0), 0);
  const langs = [...new Set(submissions.map((s) => s.language))].join(', ');
  return `
<!doctype html>
<html><body style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:600px;margin:auto;padding:24px">
  <h2 style="color:#2563eb">Coding submission received — ${candidate.name}</h2>
  <p><strong>${candidate.name}</strong> submitted their coding test.</p>
  <table style="border-collapse:collapse;margin:16px 0;font-size:14px">
    <tr><td style="padding:6px 12px 6px 0;color:#6b7280">Problems</td><td>${submissions.length}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#6b7280">Languages</td><td>${langs}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#6b7280">Test cases passed</td><td><strong>${passedTotal}/${totalTotal}</strong></td></tr>
  </table>
  <p><a href="${adminUrl}" style="display:inline-block;background:#2563eb;color:white;padding:10px 20px;border-radius:6px;text-decoration:none">Review submission</a></p>
</body></html>`;
};

const buildCodingSubmissionReceivedText = ({ candidate, submissions, adminUrl }) => {
  const passedTotal = submissions.reduce((sum, s) => sum + (s.passedCount || 0), 0);
  const totalTotal = submissions.reduce((sum, s) => sum + (s.totalCount || 0), 0);
  const langs = [...new Set(submissions.map((s) => s.language))].join(', ');
  return `${candidate.name} submitted their coding test.

Problems:           ${submissions.length}
Languages used:     ${langs}
Test cases passed:  ${passedTotal}/${totalTotal}

Review: ${adminUrl}`;
};

module.exports = { buildCodingSubmissionReceivedHtml, buildCodingSubmissionReceivedText };
