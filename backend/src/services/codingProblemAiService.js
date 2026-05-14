'use strict';

const aiService = require('./aiService');
const logger = require('../config/logger');

const LANG_LABEL = { js: 'JavaScript', python: 'Python', php: 'PHP' };

const buildStarterCodePrompt = ({ description, language }) =>
  `Given this coding problem:

"""${description}"""

Generate ONLY the starter code for ${LANG_LABEL[language]} as a self-contained program that:
- Reads input from stdin
- Includes parsing scaffolding for typical inputs
- Has a clearly-marked "// your code here" (or equivalent) placeholder where the candidate writes their solution
- Prints output to stdout

Output ONLY the code with no commentary, no markdown fences, no explanation.`;

// NOTE: starterCode is intentionally NOT in this JSON. Multi-line code embedded
// inside a JSON string is a frequent source of escape-related parse failures.
// We generate starter code via a separate plain-text call (see generateStarterCode).
const buildFullProblemPrompt = ({ topic, difficulty }) => `Generate a coding interview problem.

Requirements:
- topic: ${topic}
- difficulty: ${difficulty}
- The problem must be solvable by reading stdin and printing to stdout.

Output ONLY valid JSON in this exact shape (no markdown fences, no commentary):
{
  "title": "<short problem name, no quotes>",
  "description": "<plain-text problem statement explaining the task, input format, and output format. Keep it under 600 words. Do NOT include code blocks or triple backticks.>",
  "testCases": [
    { "stdin": "<input>", "expectedStdout": "<expected output>", "isHidden": false },
    { "stdin": "<input>", "expectedStdout": "<expected output>", "isHidden": true }
  ]
}

Include 3-5 test cases, with the first 1-2 visible (isHidden: false) as samples.`;

// Defense-in-depth: if a provider still wraps code in JSON despite { json: false },
// detect and unwrap. We try a few common shapes: { code: "..." }, { language, code },
// or a single string value. Anything else, we return the raw text unchanged.
const tryUnwrapJsonCode = (text) => {
  const t = text.trim();
  if (!t.startsWith('{') && !t.startsWith('[')) return text;
  try {
    const parsed = JSON.parse(t);
    if (typeof parsed === 'string') return parsed;
    if (parsed && typeof parsed.code === 'string') return parsed.code;
    if (Array.isArray(parsed) && typeof parsed[0] === 'string') return parsed[0];
  } catch {
    // not JSON — fall through
  }
  return text;
};

const generateStarterCode = async ({ description, language }) => {
  const prompt = buildStarterCodePrompt({ description, language });
  const { text, provider, model } = await aiService.askWithFallback(prompt, { json: false });
  if (!text) {
    logger.warn('AI starter-code generation failed (no text)');
    return null;
  }
  const unwrapped = tryUnwrapJsonCode(text);
  const stripped = unwrapped.replace(/^```[a-zA-Z]*\n?/m, '').replace(/```\s*$/m, '').trim();
  logger.info('AI starter-code generated', { provider, model, language });
  return stripped;
};

const generateFullProblem = async ({ topic, difficulty, languages }) => {
  const prompt = buildFullProblemPrompt({ topic, difficulty });
  const { text, provider, model, errors } = await aiService.askWithFallback(prompt);
  if (!text) {
    logger.warn('AI full-problem generation failed (no text)', {
      providerErrors: (errors || []).map((e) => `${e.provider}/${e.model} ${e.status || ''}: ${e.message}`),
    });
    return null;
  }
  const parsed = aiService.extractJson(text);
  if (!parsed || !parsed.title || !parsed.description || !Array.isArray(parsed.testCases) || parsed.testCases.length === 0) {
    logger.warn('AI full-problem JSON invalid or incomplete', {
      provider, model,
      missingFields: {
        parsed: !!parsed,
        title: !!parsed?.title,
        description: !!parsed?.description,
        testCasesIsArray: Array.isArray(parsed?.testCases),
        testCasesLength: parsed?.testCases?.length || 0,
      },
      rawSnippet: text.slice(0, 600),
    });
    return null;
  }
  const description = String(parsed.description).slice(0, 10000);
  const testCases = parsed.testCases.slice(0, 10).map((tc, idx) => ({
    stdin: String(tc.stdin || ''),
    expectedStdout: String(tc.expectedStdout || ''),
    // Force the first test case to be visible so candidates always see at least one sample.
    isHidden: idx === 0 ? false : tc.isHidden !== false,
  }));

  // Generate starter code per language in a SEPARATE plain-text call. Embedding
  // multi-line code inside the problem-JSON above is a frequent cause of parse
  // failures. If a language fails, fall back to empty starter code rather than
  // failing the whole request.
  const starterCode = { js: '', python: '', php: '' };
  await Promise.all(languages.map(async (lang) => {
    const code = await generateStarterCode({ description, language: lang });
    if (code) starterCode[lang] = code;
  }));

  logger.info('AI full-problem generated', { provider, model, topic, difficulty });
  return {
    title: String(parsed.title).slice(0, 200),
    description,
    difficulty,
    supportedLanguages: languages,
    starterCode,
    testCases,
  };
};

module.exports = { generateStarterCode, generateFullProblem, buildStarterCodePrompt, buildFullProblemPrompt };
