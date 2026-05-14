'use strict';

const buildPromptTestEvaluationFailedHtml = ({ candidate, reason, reviewUrl }) => `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;color:#111">
  <h2 style="color:#dc2626">Prompt test evaluation failed</h2>
  <p>The AI evaluation for <strong>${candidate.name || 'a candidate'}</strong>'s prompt test could not complete.</p>
  <p><strong>Reason:</strong> ${reason}</p>
  <p>You can retry from the candidate detail page.</p>
  <p><a href="${reviewUrl}">Open the candidate</a></p>
</div>`;

const buildPromptTestEvaluationFailedText = ({ candidate, reason, reviewUrl }) =>
  `Prompt test evaluation failed for ${candidate.name || 'a candidate'}. Reason: ${reason}. Retry: ${reviewUrl}`;

module.exports = { buildPromptTestEvaluationFailedHtml, buildPromptTestEvaluationFailedText };
