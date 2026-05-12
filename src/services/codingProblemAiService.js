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

const buildFullProblemPrompt = ({ topic, difficulty, languages }) => `Generate a coding interview problem.

Requirements:
- topic: ${topic}
- difficulty: ${difficulty}
- supported languages: ${languages.join(', ')}

Output ONLY valid JSON in this exact shape (no markdown fences, no commentary):
{
  "title": "<short problem name>",
  "description": "<markdown problem statement, includes sample input/output>",
  "starterCode": {
${languages.map((l) => `    "${l}": "<self-contained starter code for ${LANG_LABEL[l]} that reads stdin, parses input, and prints output>"`).join(',\n')}
  },
  "testCases": [
    { "stdin": "<input>", "expectedStdout": "<expected output>", "isHidden": false },
    { "stdin": "<input>", "expectedStdout": "<expected output>", "isHidden": true }
  ]
}

Include 3-5 test cases, with the first 1-2 visible (isHidden: false) as samples for the candidate.`;

const generateStarterCode = async ({ description, language }) => {
  const prompt = buildStarterCodePrompt({ description, language });
  const { text, provider, model } = await aiService.askWithFallback(prompt);
  if (!text) {
    logger.warn('AI starter-code generation failed (no text)');
    return null;
  }
  const stripped = text.replace(/^```[a-zA-Z]*\n?/m, '').replace(/```\s*$/m, '').trim();
  logger.info('AI starter-code generated', { provider, model, language });
  return stripped;
};

const generateFullProblem = async ({ topic, difficulty, languages }) => {
  const prompt = buildFullProblemPrompt({ topic, difficulty, languages });
  const { text, provider, model } = await aiService.askWithFallback(prompt);
  if (!text) {
    logger.warn('AI full-problem generation failed (no text)');
    return null;
  }
  const parsed = aiService.extractJson(text);
  if (!parsed || !parsed.title || !parsed.description || !Array.isArray(parsed.testCases) || parsed.testCases.length === 0) {
    logger.warn('AI full-problem JSON invalid or incomplete');
    return null;
  }
  const starterCode = { js: '', python: '', php: '' };
  for (const lang of languages) {
    if (parsed.starterCode?.[lang]) starterCode[lang] = String(parsed.starterCode[lang]);
  }
  const testCases = parsed.testCases.slice(0, 10).map((tc) => ({
    stdin: String(tc.stdin || ''),
    expectedStdout: String(tc.expectedStdout || ''),
    isHidden: tc.isHidden !== false,
  }));
  logger.info('AI full-problem generated', { provider, model, topic, difficulty });
  return {
    title: String(parsed.title).slice(0, 200),
    description: String(parsed.description).slice(0, 10000),
    difficulty,
    supportedLanguages: languages,
    starterCode,
    testCases,
  };
};

module.exports = { generateStarterCode, generateFullProblem, buildStarterCodePrompt, buildFullProblemPrompt };
