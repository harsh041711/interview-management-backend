'use strict';
const aiService = require('./aiService');
const promptSubmissionRepository = require('../repositories/promptSubmissionRepository');
const logger = require('../config/logger');
const { PROMPT_SUBMISSION_STATUS } = require('../utils/constants');

const DEFAULT_RUBRIC = [
  'Clarity & specificity',
  'Role / context definition',
  'Output format specification',
  'Examples or constraints provided',
  'Edge-case handling',
];

const parseJsonSafely = (text) => aiService.extractJson(text);

const buildRubricPrompt = ({ problem, candidatePrompt }) => {
  const customRubric = problem.customRubricCriteria || [];
  return [
    "You are evaluating a candidate's prompt-engineering submission.",
    '',
    'Scenario:',
    problem.description,
    '',
    'Sample input the prompt will be applied to:',
    problem.sampleInput,
    '',
    "Candidate's prompt:",
    candidatePrompt,
    '',
    'Score the prompt against this rubric. Each item: 0 = absent, 5 = excellent.',
    '',
    'Default rubric:',
    ...DEFAULT_RUBRIC.map((c, i) => `${i + 1}. ${c}`),
    '',
    customRubric.length ? 'Custom rubric (scenario-specific):' : '',
    ...customRubric.map((c) => `- ${c}`),
    '',
    'Return ONLY JSON: { "items": [{ "criterion": "<name>", "score": <0-5>, "notes": "<one sentence>" }] }',
  ].filter(Boolean).join('\n');
};

const buildExecutionPrompt = ({ problem, candidatePrompt }) => [
  'Treat the user message as an instruction prompt. Apply it to the input provided.',
  'Respond exactly as the instruction asks - do not interpret, explain, or add commentary',
  'unless the instruction explicitly asks for it.',
  '',
  '[USER PROMPT]',
  candidatePrompt,
  '',
  '[INPUT TO APPLY THE PROMPT TO]',
  problem.sampleInput,
].join('\n');

const buildOutputCheckPrompt = ({ problem, executionOutput }) => [
  'Given the expected output criteria and the actual LLM output produced by running the',
  "candidate's prompt, judge each criterion as pass or fail.",
  '',
  'Expected output criteria:',
  ...problem.expectedOutputCriteria.map((c) => `- ${c}`),
  '',
  'Actual output:',
  executionOutput,
  '',
  'Return ONLY JSON: { "items": [{ "criterion": "<name>", "pass": true|false, "notes": "<one sentence>" }] }',
].join('\n');

const evaluate = async (submissionId) => {
  const submission = await promptSubmissionRepository.findById(submissionId);
  if (!submission) {
    logger.warn('promptEvaluationService.evaluate: submission not found', { submissionId });
    return;
  }
  await promptSubmissionRepository.updateById(submissionId, { status: PROMPT_SUBMISSION_STATUS.EVALUATING });

  const problem = submission.promptProblem;
  const candidatePrompt = submission.candidatePrompt || '';
  let providerUsed = null;

  // Step 1: Rubric
  const rubricRes = await aiService.askWithFallback(buildRubricPrompt({ problem, candidatePrompt }));
  if (!rubricRes.text) {
    await promptSubmissionRepository.updateById(submissionId, {
      status: PROMPT_SUBMISSION_STATUS.EVALUATION_FAILED,
      evaluation: { aiNotes: 'Rubric scoring failed: AI returned no output' },
    });
    return;
  }
  const rubricParsed = parseJsonSafely(rubricRes.text);
  if (!rubricParsed || !Array.isArray(rubricParsed.items) || rubricParsed.items.length === 0) {
    await promptSubmissionRepository.updateById(submissionId, {
      status: PROMPT_SUBMISSION_STATUS.EVALUATION_FAILED,
      evaluation: { aiNotes: 'Rubric scoring failed: unparseable response' },
    });
    return;
  }
  providerUsed = `${rubricRes.provider}:${rubricRes.model}`;
  const rubricItems = rubricParsed.items.map((it) => ({
    criterion: String(it.criterion || ''),
    score: Math.max(0, Math.min(5, Number(it.score) || 0)),
    notes: String(it.notes || ''),
  }));
  const rubricSum = rubricItems.reduce((s, it) => s + it.score, 0);
  const rubricScore = Math.round((rubricSum / (5 * rubricItems.length)) * 50);

  // Step 2: Execute
  const execRes = await aiService.askWithFallback(buildExecutionPrompt({ problem, candidatePrompt }));
  if (!execRes.text) {
    await promptSubmissionRepository.updateById(submissionId, {
      status: PROMPT_SUBMISSION_STATUS.EVALUATION_FAILED,
      evaluation: { rubricScore, rubricBreakdown: rubricItems, aiNotes: 'Execution step failed: AI returned no output' },
    });
    return;
  }
  const executionOutput = String(execRes.text).slice(0, 4000);

  // Step 3: Output check
  const checkRes = await aiService.askWithFallback(buildOutputCheckPrompt({ problem, executionOutput }));
  if (!checkRes.text) {
    await promptSubmissionRepository.updateById(submissionId, {
      status: PROMPT_SUBMISSION_STATUS.EVALUATION_FAILED,
      evaluation: { rubricScore, rubricBreakdown: rubricItems, executionOutput, aiNotes: 'Output check failed: AI returned no output' },
    });
    return;
  }
  const checkParsed = parseJsonSafely(checkRes.text);
  if (!checkParsed || !Array.isArray(checkParsed.items) || checkParsed.items.length === 0) {
    await promptSubmissionRepository.updateById(submissionId, {
      status: PROMPT_SUBMISSION_STATUS.EVALUATION_FAILED,
      evaluation: { rubricScore, rubricBreakdown: rubricItems, executionOutput, aiNotes: 'Output check failed: unparseable response' },
    });
    return;
  }
  const outputItems = checkParsed.items.map((it) => ({
    criterion: String(it.criterion || ''),
    pass: !!it.pass,
    notes: String(it.notes || ''),
  }));
  const passCount = outputItems.filter((it) => it.pass).length;
  const outputScore = Math.round((passCount / outputItems.length) * 50);
  const totalScore = rubricScore + outputScore;

  await promptSubmissionRepository.updateById(submissionId, {
    status: PROMPT_SUBMISSION_STATUS.EVALUATED,
    evaluation: {
      rubricScore, rubricBreakdown: rubricItems,
      outputScore, outputBreakdown: outputItems,
      executionOutput, totalScore,
      aiNotes: 'Evaluated successfully',
      evaluatedAt: new Date(),
      aiProviderUsed: providerUsed,
    },
  });
  logger.info('Prompt submission evaluated', { submissionId, totalScore, providerUsed });
};

const runPreview = async ({ problem, candidatePrompt }) => {
  const res = await aiService.askWithFallback(buildExecutionPrompt({ problem, candidatePrompt }));
  if (!res.text) return { output: null, provider: null };
  return { output: String(res.text).slice(0, 4000), provider: `${res.provider}:${res.model}` };
};

module.exports = { evaluate, runPreview, DEFAULT_RUBRIC };
