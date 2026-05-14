'use strict';
const aiService = require('./aiService');
const logger = require('../config/logger');

const RESUME_EXCERPT_LIMIT = 1500;

const buildQuestionsPrompt = ({ candidate, jdText, durationMinutes, priorReviews }) => {
  const sc = candidate.screening || {};
  const resumeExcerpt = (sc.resumeText || '').slice(0, RESUME_EXCERPT_LIMIT);
  const priorSummary = (priorReviews || []).map((r, i) => {
    const rt = r.ratings || {};
    const avg = [rt.knowledge, rt.communication, rt.confidence].filter((x) => typeof x === 'number');
    const avgStr = avg.length ? (avg.reduce((a, b) => a + b, 0) / avg.length).toFixed(1) : 'n/a';
    return `- Round ${i + 1}: avg ${avgStr}/5. ${r.comments || ''}`;
  }).join('\n');

  const lines = [
    'You are designing an interview for a candidate. Generate 12 questions a non-domain-expert interviewer can ask comfortably.',
    '',
    `Job description:\n${jdText || 'unspecified'}`,
    '',
    'Candidate snapshot:',
    `- Name: ${candidate.name || 'unspecified'}`,
    `- Experience: ${candidate.experience || 0} years`,
    `- Stack: ${(candidate.techStack || []).join(', ') || 'unspecified'}`,
    `- Screening summary: ${sc.summary || 'n/a'}`,
    `- Green flags: ${(sc.greenFlags || []).join('; ') || 'n/a'}`,
    `- Red flags: ${(sc.redFlags || []).join('; ') || 'n/a'}`,
    `- Resume excerpt: ${resumeExcerpt || 'n/a'}`,
    '',
    priorSummary ? `Prior round feedback (avoid repeating, focus on weak areas):\n${priorSummary}` : 'No prior rounds.',
    '',
    `Generate 12 questions for a ${durationMinutes}-minute interview.`,
    'Distribute: 4 easy, 5 medium, 3 hard.',
    'Each item must include: text (1-3 sentences), difficulty (easy|medium|hard), topic (short tag from the JD).',
    '',
    'Return ONLY a JSON array. No prose, no markdown fences.',
  ];
  return lines.join('\n');
};

const sanitizeQuestion = (q) => {
  if (!q || typeof q.text !== 'string') return null;
  if (!['easy', 'medium', 'hard'].includes(q.difficulty)) return null;
  return {
    text: q.text.slice(0, 600),
    difficulty: q.difficulty,
    topic: (typeof q.topic === 'string' ? q.topic : '').slice(0, 80),
  };
};

const generateQuestions = async ({ candidate, jdText, durationMinutes, priorReviews }) => {
  const prompt = buildQuestionsPrompt({ candidate, jdText, durationMinutes, priorReviews });
  const { text, provider, model } = await aiService.askWithFallback(prompt);
  if (!text) {
    logger.warn('live-interview AI returned nothing for questions');
    return { questions: [], provider: null, model: null };
  }
  const parsed = aiService.extractJson(text);
  if (!Array.isArray(parsed)) {
    logger.warn('live-interview AI: questions JSON not an array');
    return { questions: [], provider, model };
  }
  const questions = parsed.map(sanitizeQuestion).filter(Boolean);
  logger.info('live-interview AI questions', { provider, model, count: questions.length });
  return { questions, provider, model };
};

const VALID_RECS = new Set(['hire', 'no_hire', 'next_round']);

const clampRating = (n) => {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  if (n < 1) return 1;
  if (n > 5) return 5;
  return Math.round(n);
};

const buildDraftPrompt = ({ asked }) => {
  const items = asked.map((q, i) =>
    `${i + 1}. [${q.difficulty}] ${q.text}\n   Note: ${q.note || '(none)'}\n   Rating: ${q.rating != null ? q.rating : '(none)'}`,
  ).join('\n');
  return [
    'You are an interview reviewer. Below are the questions asked, the interviewer\'s notes, and per-question ratings.',
    '',
    items,
    '',
    'Produce a balanced, concise review:',
    '- knowledge: integer 1-5 (weight hard questions 1.5x in your judgement)',
    '- communication: integer 1-5 (infer from how notes describe clarity of expression)',
    '- confidence: integer 1-5 (infer from notes — hesitation, certainty)',
    '- comments: 2-4 sentences. First: strengths. Second: weaknesses. Third: hiring rationale.',
    '- recommendation: one of "hire", "no_hire", "next_round"',
    '',
    'Return ONLY a JSON object with those 5 fields. No prose, no markdown fences.',
  ].join('\n');
};

const fallbackDraft = (asked) => ({
  knowledge: null, communication: null, confidence: null,
  comments: asked.map((q) => `${q.text}\n  Note: ${q.note || '—'} (rating ${q.rating ?? '—'})`).join('\n\n'),
  recommendation: null,
});

const generateDraftReview = async ({ questions }) => {
  const asked = (questions || []).filter((q) => q.askedAt);
  if (asked.length === 0) {
    return { draft: { knowledge: null, communication: null, confidence: null, comments: '', recommendation: null }, provider: null, model: null };
  }
  const prompt = buildDraftPrompt({ asked });
  const { text, provider, model } = await aiService.askWithFallback(prompt);
  if (!text) {
    logger.warn('live-interview AI returned nothing for draft review');
    return { draft: fallbackDraft(asked), provider: null, model: null };
  }
  const parsed = aiService.extractJson(text);
  if (!parsed || typeof parsed !== 'object') {
    logger.warn('live-interview AI: draft JSON invalid');
    return { draft: fallbackDraft(asked), provider, model };
  }
  const draft = {
    knowledge:      clampRating(parsed.knowledge),
    communication:  clampRating(parsed.communication),
    confidence:     clampRating(parsed.confidence),
    comments:       (typeof parsed.comments === 'string' ? parsed.comments : '').slice(0, 4000),
    recommendation: VALID_RECS.has(parsed.recommendation) ? parsed.recommendation : null,
  };
  return { draft, provider, model };
};

module.exports = { generateQuestions, generateDraftReview, buildQuestionsPrompt };
