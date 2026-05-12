'use strict';

const buildResumeShortlistedHtml = ({ candidate }) => `
<!doctype html>
<html><body style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:600px;margin:auto;padding:24px">
  <h2 style="color:#0f766e">Your application has been shortlisted</h2>
  <p>Hi ${candidate.name},</p>
  <p>Your resume has been reviewed and <strong>shortlisted</strong> for the
     <strong>${(candidate.techStack || []).join(', ')}</strong> ${candidate.experience || ''} role.</p>
  <p>Your assessment test link will arrive in a separate email shortly — please watch your inbox.</p>
  <p>Best regards,<br/>The Hiring Team</p>
</body></html>`;

const buildResumeShortlistedText = ({ candidate }) =>
  `Hi ${candidate.name},

Your resume has been reviewed and shortlisted for the ${(candidate.techStack || []).join(', ')} ${candidate.experience || ''} role.

Your assessment test link will arrive in a separate email shortly — please watch your inbox.

Best regards,
The Hiring Team`;

module.exports = { buildResumeShortlistedHtml, buildResumeShortlistedText };
