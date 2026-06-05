'use strict';

const buildPromptTestAssignedHtml = ({ candidate, problem, accessUrl, expiresAt }) => `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;background:#fff;color:#111">
  <h2 style="color:#2563eb">Your Prompt Engineering Test</h2>
  <p>Hi ${candidate.name || 'there'},</p>
  <p>You've been assigned a prompt engineering scenario as part of your interview process.</p>
  <p><strong>Scenario:</strong> ${problem.title}</p>
  <p><strong>Duration:</strong> ${problem.durationMinutes} minutes</p>
  <p><strong>Expires:</strong> ${expiresAt.toLocaleString()}</p>
  <p style="margin:24px 0">
    <a href="${accessUrl}" style="background:#2563eb;color:white;padding:10px 18px;border-radius:6px;text-decoration:none">Start the test</a>
  </p>
  <p>If the button doesn't work, paste this URL: ${accessUrl}</p>
</div>`;

const buildPromptTestAssignedText = ({ candidate, problem, accessUrl, expiresAt }) =>
  `Hi ${candidate.name || 'there'},

You've been assigned a prompt engineering test: ${problem.title}
Duration: ${problem.durationMinutes} minutes
Expires: ${expiresAt.toLocaleString()}

Start: ${accessUrl}`;

module.exports = { buildPromptTestAssignedHtml, buildPromptTestAssignedText };
