'use strict';

const buildCodingTestInviteHtml = ({ candidate, codingTestUrl, problemCount, durationMinutes }) => `
<!doctype html>
<html><body style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:600px;margin:auto;padding:24px">
  <h2 style="color:#2563eb">Your coding challenge is ready</h2>
  <p>Hi ${candidate.name},</p>
  <p>As part of your application for the <strong>${(candidate.techStack || []).join(', ')}</strong> role, please complete this coding challenge.</p>
  <table style="border-collapse:collapse;margin:16px 0;font-size:14px">
    <tr><td style="padding:6px 12px 6px 0;color:#6b7280">Problems</td><td><strong>${problemCount}</strong></td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#6b7280">Duration</td><td><strong>${durationMinutes} minutes</strong> total</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#6b7280">Languages</td><td>JavaScript, Python, or PHP (your choice per problem)</td></tr>
  </table>
  <p><a href="${codingTestUrl}" style="display:inline-block;background:#2563eb;color:white;padding:10px 20px;border-radius:6px;text-decoration:none">Open coding test</a></p>
  <p style="color:#6b7280;font-size:13px">Note: pasting is disabled in the editor and tab-switching is monitored. The timer starts the moment you open the link. Good luck!</p>
  <p>Best regards,<br/>The Hiring Team</p>
</body></html>`;

const buildCodingTestInviteText = ({ candidate, codingTestUrl, problemCount, durationMinutes }) =>
  `Hi ${candidate.name},

Your coding challenge is ready.

Problems: ${problemCount}
Duration: ${durationMinutes} minutes total
Languages: JavaScript, Python, or PHP (your choice per problem)

Open: ${codingTestUrl}

Note: pasting is disabled in the editor and tab-switching is monitored. The timer starts the moment you open the link.

Best regards,
The Hiring Team`;

module.exports = { buildCodingTestInviteHtml, buildCodingTestInviteText };
