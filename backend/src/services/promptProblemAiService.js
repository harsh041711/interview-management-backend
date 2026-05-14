'use strict';
const aiService = require('./aiService');
const logger = require('../config/logger');

const RESUME_EXCERPT_LIMIT = 2000;

const buildPrompt = ({ candidate, topicOverride, difficultyOverride }) => {
  const sc = candidate.screening || {};
  const resumeExcerpt = (sc.resumeText || '').slice(0, RESUME_EXCERPT_LIMIT);
  const lines = [
    'You are designing a prompt-engineering interview problem for a specific candidate.',
    '',
    'Candidate profile:',
    `- Experience level: ${candidate.experience || 'mid'}`,
    `- Tech stack: ${(candidate.techStack || []).join(', ') || 'unspecified'}`,
    `- Screening summary: ${sc.summary || 'n/a'}`,
    `- Strengths: ${(sc.greenFlags || []).join('; ') || 'n/a'}`,
    `- Gaps to probe: ${(sc.redFlags || []).join('; ') || 'n/a'}`,
    `- Resume excerpt: ${resumeExcerpt || 'n/a'}`,
    '',
    'Constraints:',
    `- Difficulty: ${difficultyOverride || 'matched to experience'}`,
    `- Topic: ${topicOverride || "candidate's strongest area"}`,
    '- Duration: 15-20 minutes',
    '',
    'Generate ONE prompt-engineering scenario. The candidate will be given the scenario',
    '+ a sample input and asked to write a prompt that, when run against the sample input,',
    'produces the expected output. The scenario should be realistic for their experience',
    'level and target their stack.',
    '',
    'Output ONLY valid JSON in this exact shape (no markdown fences, no commentary):',
    '{',
    '  "title": "<short>",',
    '  "description": "<2-4 sentences describing the task>",',
    '  "sampleInput": "<the actual text/data the prompt will be applied to>",',
    '  "expectedOutputCriteria": ["<criterion 1>", "<criterion 2>", "<criterion 3>"],',
    '  "customRubricCriteria": ["<scenario-specific criterion>"],',
    '  "difficulty": "<easy|medium|hard>",',
    '  "tags": ["<tag1>", "<tag2>"],',
    '  "durationMinutes": 20',
    '}',
  ];
  return lines.join('\n');
};

const stripFences = (s) =>
  String(s || '').replace(/^```[a-zA-Z]*\n?/m, '').replace(/```\s*$/m, '').trim();

const generatePersonalizedPromptProblem = async ({ candidate, topicOverride, difficultyOverride } = {}) => {
  const prompt = buildPrompt({ candidate, topicOverride, difficultyOverride });
  const { text, provider, model } = await aiService.askWithFallback(prompt);
  if (!text) {
    logger.warn('AI prompt-problem generation returned nothing');
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(stripFences(text));
  } catch (err) {
    logger.warn('AI prompt-problem generation: JSON parse failed', { err: err.message });
    return null;
  }
  if (!parsed.title || !parsed.description || !parsed.sampleInput || !Array.isArray(parsed.expectedOutputCriteria)) {
    logger.warn('AI prompt-problem generation: required fields missing');
    return null;
  }
  parsed._provider = provider;
  parsed._model = model;
  logger.info('AI prompt-problem generated', { provider, model });
  return parsed;
};

module.exports = { generatePersonalizedPromptProblem };
