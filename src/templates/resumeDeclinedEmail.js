'use strict';

const buildResumeDeclinedHtml = ({ candidate }) => `
<!doctype html>
<html><body style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:600px;margin:auto;padding:24px">
  <h2>Update on your application</h2>
  <p>Hi ${candidate.name},</p>
  <p>Thank you for your interest in the <strong>${(candidate.techStack || []).join(', ')}</strong> ${candidate.experience || ''} role.</p>
  <p>After reviewing your resume, we have decided not to move forward at this time. We appreciate the time you took to apply and wish you the very best in your job search.</p>
  <p>Warm regards,<br/>The Hiring Team</p>
</body></html>`;

const buildResumeDeclinedText = ({ candidate }) =>
  `Hi ${candidate.name},

Thank you for your interest in the ${(candidate.techStack || []).join(', ')} ${candidate.experience || ''} role.

After reviewing your resume, we have decided not to move forward at this time. We appreciate the time you took to apply and wish you the very best in your job search.

Warm regards,
The Hiring Team`;

module.exports = { buildResumeDeclinedHtml, buildResumeDeclinedText };
