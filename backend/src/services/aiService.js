'use strict';

const env = require('../config/env');
const logger = require('../config/logger');
const { AI_PROVIDERS, QUESTION_TYPES } = require('../utils/constants');

const GEMINI_MODEL_CHAIN = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
];

const GROQ_MODEL_CHAIN = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
];

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

const geminiUrl = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

const fetchWithTimeout = async (url, options, timeoutMs) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
};

// Errors that should bail out instead of trying the next model
// (auth issues, malformed request — retrying with a different model won't help).
const isFatalStatus = (status) => status === 401 || status === 403 || status === 400;

// HTTP statuses worth retrying on the next model in the chain
// (rate limit, model unavailable, transient server errors).
const isRetryableStatus = (status) =>
  status === 429 || status === 408 || (status >= 500 && status < 600) || status === 404;

const callGeminiOnce = async (model, prompt, { json = true } = {}) => {
  const apiKey = env.ai.gemini.apiKey;
  if (!apiKey) throw new Error('Gemini not configured');

  const url = `${geminiUrl(model)}?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.4,
      topP: 0.95,
      maxOutputTokens: 4096,
      ...(json ? { responseMimeType: 'application/json' } : {}),
    },
  };

  const res = await fetchWithTimeout(
    url,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    env.ai.requestTimeoutMs,
  );

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    const err = new Error(`Gemini ${model} ${res.status}: ${txt.slice(0, 200)}`);
    err.status = res.status;
    err.retryable = isRetryableStatus(res.status);
    err.fatal = isFatalStatus(res.status);
    throw err;
  }
  const data = await res.json();
  const candidate = data.candidates?.[0];
  if (candidate?.finishReason === 'SAFETY') {
    throw new Error(`Gemini ${model}: response blocked for safety`);
  }
  const parts = candidate?.content?.parts || [];
  const text = parts.map((p) => p.text || '').join('').trim();
  if (!text) throw new Error(`Gemini ${model}: empty response`);
  return text;
};

const callGroqOnce = async (model, prompt, { json = true } = {}) => {
  if (!env.ai.groq.apiKey) throw new Error('Groq not configured');

  const res = await fetchWithTimeout(
    GROQ_API_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.ai.groq.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
    },
    env.ai.requestTimeoutMs,
  );

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    const err = new Error(`Groq ${model} ${res.status}: ${txt.slice(0, 200)}`);
    err.status = res.status;
    err.retryable = isRetryableStatus(res.status);
    err.fatal = isFatalStatus(res.status);
    throw err;
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error(`Groq ${model}: empty response`);
  return text;
};

const tryChain = async (provider, models, prompt, callOnce, options) => {
  const errors = [];
  for (const model of models) {
    try {
      const text = await callOnce(model, prompt, options);
      return { text, provider, model };
    } catch (err) {
      errors.push({ provider, model, message: err.message, status: err.status });
      if (err.fatal) {
        logger.warn(`${provider} fatal — abandoning chain`, { model, status: err.status });
        break;
      }
      logger.warn(`${provider}/${model} failed, trying next model`, { err: err.message, status: err.status });
      // continue to next model
    }
  }
  return { text: null, errors };
};

// options.json: when true (default), Gemini/Groq are told to return strict JSON.
// Pass { json: false } for prompts that ask for plain text (e.g. starter code),
// otherwise the providers will wrap the output in JSON.
const askWithFallback = async (prompt, options = {}) => {
  const allErrors = [];

  if (env.ai.gemini.apiKey) {
    const r = await tryChain(AI_PROVIDERS.GEMINI, GEMINI_MODEL_CHAIN, prompt, callGeminiOnce, options);
    if (r.text) return { text: r.text, provider: r.provider, model: r.model };
    allErrors.push(...r.errors);
  }

  if (env.ai.groq.apiKey) {
    const r = await tryChain(AI_PROVIDERS.GROQ, GROQ_MODEL_CHAIN, prompt, callGroqOnce, options);
    if (r.text) return { text: r.text, provider: r.provider, model: r.model };
    allErrors.push(...r.errors);
  }

  return { text: null, provider: null, model: null, errors: allErrors };
};

const extractJson = (text) => {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.search(/[\[{]/);
  if (start === -1) return null;
  const slice = candidate.slice(start);
  const open = slice[0];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let endIdx = -1;
  let inStr = false;
  let escape = false;
  for (let i = 0; i < slice.length; i += 1) {
    const ch = slice[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) { endIdx = i; break; }
    }
  }
  if (endIdx === -1) return null;
  try {
    return JSON.parse(slice.slice(0, endIdx + 1));
  } catch {
    return null;
  }
};

const buildQuestionGenerationPrompt = ({ techStack, count, types, difficulty }) => {
  const typeList = (types && types.length ? types : Object.values(QUESTION_TYPES)).join(', ');
  const diff = difficulty || 'mixed (easy/medium/hard)';
  return `You are an expert interview coach. Generate ${count} interview questions for the tech stack "${techStack}".

Rules:
- Mix question types from this set: [${typeList}]
- For type "mcq": provide 4 plausible options with exactly one correctAnswer (the option text).
- For type "multi_select": provide 4 options, correctAnswer is an array of correct option texts (>=2).
- For type "one_line": correctAnswer is the canonical short answer; also provide "keywords" — 3-6 lowercase synonyms acceptable for matching.
- For type "descriptive": no options/correctAnswer, but provide a short "rubric" (max 3 sentences) describing what an excellent answer covers.
- difficulty must be one of: easy, medium, hard. Aim for: ${diff}
- Each question must have integer "marks" 1-5 reflecting difficulty.
- Output ONLY a JSON object with shape: { "questions": [...] }. No prose, no markdown fences, no comments.

Schema for each item in "questions":
{
  "techStack": "${techStack}",
  "type": "mcq" | "multi_select" | "one_line" | "descriptive",
  "question": string,
  "options": string[]?,
  "correctAnswer": string | string[]?,
  "keywords": string[]?,
  "rubric": string?,
  "marks": number,
  "difficulty": "easy" | "medium" | "hard"
}`;
};

const generateQuestions = async ({ techStack, count = 10, types, difficulty }) => {
  const prompt = buildQuestionGenerationPrompt({ techStack, count, types, difficulty });
  const { text, provider, model, errors } = await askWithFallback(prompt);
  if (!text) {
    const detail = errors?.map((e) => `${e.provider}/${e.model}: ${e.message}`).join('; ') || 'unknown';
    const err = new Error(`AI providers unavailable (${detail})`);
    err.aiErrors = errors;
    throw err;
  }
  const parsed = extractJson(text);
  // Accept either { questions: [...] } or a top-level array
  const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.questions) ? parsed.questions : null;
  if (!list) throw new Error('AI did not return a JSON array of questions');
  return { questions: list, provider, model };
};

const buildDescriptiveEvalPrompt = ({ question, answer, rubric, maxScore }) => `You are grading a candidate's interview answer.

Question:
"""${question}"""

Candidate answer:
"""${answer || '[no answer]'}"""

${rubric ? `Grading rubric:\n${rubric}\n` : ''}
Max score: ${maxScore}

Return ONLY a JSON object of exact shape:
{ "score": number (0..${maxScore}, decimals OK), "feedback": string (1-3 sentences, professional, specific), "isCorrect": boolean }

Be fair, calibrated, and concise. No prose outside the JSON.`;

const evaluateDescriptive = async ({ question, answer, rubric, maxScore = 5 }) => {
  const prompt = buildDescriptiveEvalPrompt({ question, answer, rubric, maxScore });
  const { text, provider, model } = await askWithFallback(prompt);
  if (!text) {
    return { score: 0, feedback: 'Evaluation unavailable (AI providers offline).', isCorrect: false, provider: null, model: null };
  }
  const parsed = extractJson(text);
  if (!parsed || typeof parsed.score !== 'number') {
    return { score: 0, feedback: 'AI returned an unparsable response.', isCorrect: false, provider, model };
  }
  const clamped = Math.max(0, Math.min(maxScore, parsed.score));
  return {
    score: clamped,
    feedback: String(parsed.feedback || '').slice(0, 1500),
    isCorrect: Boolean(parsed.isCorrect),
    provider,
    model,
  };
};

module.exports = {
  generateQuestions,
  evaluateDescriptive,
  askWithFallback,
  extractJson,
  GEMINI_MODEL_CHAIN,
  GROQ_MODEL_CHAIN,
};
