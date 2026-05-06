'use strict';

const questionRepository = require('../repositories/questionRepository');
const aiService = require('./aiService');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const {
  QUESTION_TYPES,
  QUESTION_TYPE_LIST,
  DIFFICULTY,
  DIFFICULTY_LIST,
  QUESTION_SOURCE,
} = require('../utils/constants');

const sanitizeQuestionInput = (raw) => {
  const type = raw.type;
  const base = {
    techStack: String(raw.techStack || '').trim(),
    type,
    question: String(raw.question || '').trim(),
    difficulty: DIFFICULTY_LIST.includes(raw.difficulty) ? raw.difficulty : DIFFICULTY.MEDIUM,
    marks: Number.isFinite(Number(raw.marks)) ? Number(raw.marks) : 1,
    source: raw.source === QUESTION_SOURCE.AI ? QUESTION_SOURCE.AI : QUESTION_SOURCE.MANUAL,
    rubric: raw.rubric ? String(raw.rubric).trim() : undefined,
  };
  switch (type) {
    case QUESTION_TYPES.MCQ:
      base.options = Array.isArray(raw.options) ? raw.options.map((o) => String(o).trim()).filter(Boolean) : [];
      base.correctAnswer = String(raw.correctAnswer || '').trim();
      break;
    case QUESTION_TYPES.MULTI_SELECT:
      base.options = Array.isArray(raw.options) ? raw.options.map((o) => String(o).trim()).filter(Boolean) : [];
      base.correctAnswer = Array.isArray(raw.correctAnswer)
        ? raw.correctAnswer.map((o) => String(o).trim()).filter(Boolean)
        : [];
      break;
    case QUESTION_TYPES.ONE_LINE:
      base.correctAnswer = String(raw.correctAnswer || '').trim();
      base.keywords = Array.isArray(raw.keywords)
        ? raw.keywords.map((k) => String(k).trim().toLowerCase()).filter(Boolean)
        : [];
      break;
    case QUESTION_TYPES.DESCRIPTIVE:
      base.correctAnswer = raw.correctAnswer ? String(raw.correctAnswer).trim() : undefined;
      break;
    default:
      throw ApiError.badRequest(`Unknown question type: ${type}`);
  }
  return base;
};

const create = async (raw, adminId) => {
  const data = sanitizeQuestionInput(raw);
  return questionRepository.create({ ...data, createdBy: adminId });
};

const bulkCreate = async (rawList, adminId) => {
  if (!Array.isArray(rawList) || rawList.length === 0) {
    throw ApiError.badRequest('questions array is required');
  }
  const docs = rawList.map((raw) => ({ ...sanitizeQuestionInput(raw), createdBy: adminId }));
  return questionRepository.insertMany(docs);
};

const generateAndSave = async ({ techStack, count = 10, types, difficulty, persist = true }, adminId) => {
  let aiQuestions = [];
  let provider = null;
  let model = null;
  let aiError = null;

  try {
    const result = await aiService.generateQuestions({ techStack, count, types, difficulty });
    aiQuestions = result.questions || [];
    provider = result.provider;
    model = result.model;
  } catch (err) {
    aiError = err.message || 'AI providers unavailable';
    logger.warn('AI question generation failed, will try manual fallback', { err: aiError });
  }

  const cleaned = [];
  for (const q of aiQuestions) {
    if (!q || !QUESTION_TYPE_LIST.includes(q.type) || !q.question) continue;
    try {
      cleaned.push({
        ...sanitizeQuestionInput({ ...q, source: QUESTION_SOURCE.AI }),
        createdBy: adminId,
      });
    } catch {
      // skip invalid entry
    }
  }

  if (cleaned.length) {
    if (!persist) return { questions: cleaned, provider, model, persisted: false, source: 'ai' };
    const saved = await questionRepository.insertMany(cleaned);
    return { questions: saved, provider, model, persisted: true, source: 'ai' };
  }

  // Fallback path: AI produced nothing usable. Pull from HR-curated manual question bank.
  const fallback = await questionRepository.list({
    techStack,
    type: types?.length === 1 ? types[0] : undefined,
    difficulty,
    isActive: true,
    page: 1,
    limit: count,
  });

  if (!fallback.items.length) {
    throw ApiError.unprocessable(
      aiError
        ? `AI generation failed and no manual questions exist for "${techStack}". Add manual questions or retry. (${aiError})`
        : `AI returned no usable questions and no manual questions exist for "${techStack}".`,
      { code: 'E_QUESTION_GENERATION_FAILED' },
    );
  }

  return {
    questions: fallback.items,
    provider: null,
    model: null,
    persisted: false,
    source: 'manual_fallback',
    aiError: aiError || 'AI returned no usable questions',
  };
};

const list = (query) => questionRepository.list(query);

const listTechStacks = async () => {
  const stacks = await questionRepository.distinctTechStacks();
  return stacks
    .filter(Boolean)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
};

const update = async (id, raw) => {
  const existing = await questionRepository.findById(id);
  if (!existing) throw ApiError.notFound('Question not found');
  const merged = sanitizeQuestionInput({ ...existing.toObject(), ...raw });
  const saved = await questionRepository.updateById(id, merged);
  return saved;
};

const remove = async (id) => {
  const existing = await questionRepository.findById(id);
  if (!existing) throw ApiError.notFound('Question not found');
  await questionRepository.deleteById(id);
  return { id };
};

module.exports = {
  create,
  bulkCreate,
  generateAndSave,
  list,
  listTechStacks,
  update,
  remove,
  sanitizeQuestionInput,
};
