'use strict';

const buildPromptTestSubmittedHtml = ({ candidate, reviewUrl }) => `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;color:#111">
  <h2 style="color:#2563eb">Prompt test submitted</h2>
  <p><strong>${candidate.name || 'A candidate'}</strong> has submitted their prompt engineering test.</p>
  <p>The AI evaluation is running in the background; once complete you'll see the full breakdown.</p>
  <p><a href="${reviewUrl}">Open the candidate</a></p>
</div>`;

const buildPromptTestSubmittedText = ({ candidate, reviewUrl }) =>
  `Prompt test submitted by ${candidate.name || 'a candidate'}.
Review: ${reviewUrl}`;

module.exports = { buildPromptTestSubmittedHtml, buildPromptTestSubmittedText };
