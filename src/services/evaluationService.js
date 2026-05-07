'use strict';

const aiService = require('./aiService');
const { QUESTION_TYPES } = require('../utils/constants');

const normalize = (s) =>
  String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s]+/gu, '')
    .replace(/\s+/g, ' ');

const evaluateMcq = (question, given) => {
  const correct = String(question.correctAnswer || '').trim();
  const isCorrect = typeof given === 'string' && given.trim() === correct;
  return {
    isCorrect,
    score: isCorrect ? question.marks : 0,
    maxScore: question.marks,
    aiProvider: null,
  };
};

const evaluateMultiSelect = (question, given) => {
  if (!Array.isArray(given)) {
    return { isCorrect: false, score: 0, maxScore: question.marks, aiProvider: null };
  }
  const correct = new Set((question.correctAnswer || []).map((s) => String(s).trim()));
  const provided = new Set(given.map((s) => String(s).trim()));
  const isCorrect =
    correct.size === provided.size && [...correct].every((c) => provided.has(c));
  // Partial credit: ratio of true-positives minus false-positives, clamped at 0.
  const tp = [...provided].filter((p) => correct.has(p)).length;
  const fp = [...provided].filter((p) => !correct.has(p)).length;
  const ratio = correct.size === 0 ? 0 : Math.max(0, (tp - fp) / correct.size);
  const score = isCorrect ? question.marks : Number((question.marks * ratio).toFixed(2));
  return { isCorrect, score, maxScore: question.marks, aiProvider: null };
};

const evaluateOneLine = (question, given) => {
  const ans = normalize(given);
  if (!ans) return { isCorrect: false, score: 0, maxScore: question.marks, aiProvider: null };

  const correct = normalize(question.correctAnswer);
  if (correct && ans === correct) {
    return { isCorrect: true, score: question.marks, maxScore: question.marks, aiProvider: null };
  }
  const keywords = (question.keywords || []).map(normalize).filter(Boolean);
  if (keywords.length === 0 && correct) {
    // fall back to substring match either way
    if (ans.includes(correct) || correct.includes(ans)) {
      return { isCorrect: true, score: question.marks, maxScore: question.marks, aiProvider: null };
    }
    return { isCorrect: false, score: 0, maxScore: question.marks, aiProvider: null };
  }
  const tokens = ans.split(' ');
  const hits = keywords.filter((kw) => tokens.includes(kw) || ans.includes(kw)).length;
  const matchRatio = keywords.length ? hits / keywords.length : 0;
  const isCorrect = matchRatio >= 0.5;
  const score = Number((question.marks * Math.min(1, matchRatio)).toFixed(2));
  return { isCorrect, score, maxScore: question.marks, aiProvider: null };
};

const evaluateDescriptive = async (question, given) => {
  const text = typeof given === 'string' ? given.trim() : '';
  if (!text) {
    return {
      isCorrect: false,
      score: 0,
      maxScore: question.marks,
      aiFeedback: 'No answer provided.',
      aiProvider: null,
    };
  }
  const ai = await aiService.evaluateDescriptive({
    question: question.question,
    answer: text,
    rubric: question.rubric || question.correctAnswer,
    maxScore: question.marks,
  });
  return {
    isCorrect: ai.isCorrect,
    score: ai.score,
    maxScore: question.marks,
    aiFeedback: ai.feedback,
    aiProvider: ai.provider,
  };
};

const evaluateOne = async (question, given) => {
  switch (question.type) {
    case QUESTION_TYPES.MCQ:
      return evaluateMcq(question, given);
    case QUESTION_TYPES.MULTI_SELECT:
      return evaluateMultiSelect(question, given);
    case QUESTION_TYPES.ONE_LINE:
      return evaluateOneLine(question, given);
    case QUESTION_TYPES.DESCRIPTIVE:
      return evaluateDescriptive(question, given);
    default:
      return { isCorrect: false, score: 0, maxScore: question.marks || 0, aiProvider: null };
  }
};

const evaluateAll = async ({ questions, answers }) => {
  const byId = new Map(answers.map((a) => [String(a.questionId), a.answer]));
  const results = [];
  let totalScore = 0;
  let maxScore = 0;
  for (const q of questions) {
    const given = byId.get(String(q._id || q.id));
    const r = await evaluateOne(q, given);
    totalScore += r.score;
    maxScore += r.maxScore;
    results.push({
      question: q._id || q.id,
      type: q.type,
      given: given ?? null,
      isCorrect: r.isCorrect,
      score: r.score,
      maxScore: r.maxScore,
      aiFeedback: r.aiFeedback,
      aiProvider: r.aiProvider || null,
    });
  }
  const percentage = maxScore > 0 ? Number(((totalScore / maxScore) * 100).toFixed(2)) : 0;
  return { answers: results, totalScore: Number(totalScore.toFixed(2)), maxScore, percentage };
};

module.exports = {
  evaluateAll,
  evaluateOne,
  evaluateMcq,
  evaluateMultiSelect,
  evaluateOneLine,
  evaluateDescriptive,
  normalize,
};
