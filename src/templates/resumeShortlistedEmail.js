'use strict';

const buildResumeShortlistedHtml = ({ candidate }) => `
<!doctype html>
<html><body style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:600px;margin:auto;padding:24px">
  <h2 style="color:#0f766e">Your resume has been shortlisted</h2>
  <p>Hi ${candidate.name},</p>
  <p>Good news — your resume has been <strong>shortlisted</strong> for the
     <strong>${(candidate.techStack || []).join(', ')}</strong> ${candidate.experience || ''} role.</p>
  <p>We'll send you your assessment test link within the next hour. Please keep an eye on your inbox.</p>
  <p>Best regards,<br/>The Hiring Team</p>
</body></html>`;

const buildResumeShortlistedText = ({ candidate }) =>
  `Hi ${candidate.name},

Good news — your resume has been shortlisted for the ${(candidate.techStack || []).join(', ')} ${candidate.experience || ''} role.

We'll send you your assessment test link within the next hour. Please keep an eye on your inbox.

Best regards,
The Hiring Team`;

module.exports = { buildResumeShortlistedHtml, buildResumeShortlistedText };
