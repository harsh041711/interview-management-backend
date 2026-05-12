'use strict';

const cpRepo = require('../repositories/codingProblemRepository');
const codingAi = require('./codingProblemAiService');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');

const present = (doc) => ({
  id: doc.id || String(doc._id),
  title: doc.title,
  description: doc.description,
  difficulty: doc.difficulty,
  techStack: doc.techStack,
  supportedLanguages: doc.supportedLanguages,
  starterCode: doc.starterCode || { js: '', python: '', php: '' },
  testCases: doc.testCases || [],
  source: doc.source,
  isActive: doc.isActive,
  timesUsed: doc.timesUsed || 0,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

const create = async (payload, adminId) => {
  const doc = await cpRepo.create({ ...payload, createdBy: adminId });
  return present(doc);
};

const detail = async (id) => {
  const doc = await cpRepo.findById(id);
  if (!doc) throw ApiError.notFound('Problem not found');
  return present(doc);
};

const update = async (id, updates) => {
  const doc = await cpRepo.findById(id);
  if (!doc) throw ApiError.notFound('Problem not found');
  const updated = await cpRepo.updateById(id, updates);
  return present(updated);
};

const deactivate = async (id) => {
  const doc = await cpRepo.findById(id);
  if (!doc) throw ApiError.notFound('Problem not found');
  const updated = await cpRepo.updateById(id, { isActive: false });
  return present(updated);
};

const list = async (query) => {
  const result = await cpRepo.list(query);
  return { ...result, items: result.items.map(present) };
};

const sampleForCandidate = async ({ techStacks, difficulty, problemCount, adminId }) => {
  const bank = await cpRepo.sampleActive({ techStacks, difficulty, limit: problemCount });
  const picked = [...bank];
  const stillNeed = problemCount - picked.length;

  if (stillNeed > 0) {
    const primaryStack = techStacks[0];
    for (let i = 0; i < stillNeed; i += 1) {
      const draft = await codingAi.generateFullProblem({
        topic: primaryStack,
        difficulty,
        languages: ['js', 'python', 'php'],
      });
      if (!draft) {
        if (picked.length === 0) {
          throw ApiError.conflict(
            'No coding problems available and AI generation failed',
            { code: 'E_NO_PROBLEMS' },
          );
        }
        logger.warn('AI generation failed during sampling — returning partial set', {
          requested: problemCount, actual: picked.length,
        });
        break;
      }
      const saved = await cpRepo.create({
        ...draft,
        techStack: [primaryStack],
        source: 'ai',
        createdBy: adminId,
        timesUsed: 1,
      });
      picked.push(saved);
    }
  }

  if (picked.length > 0) {
    const bankIds = bank.map((p) => p._id || p.id);
    if (bankIds.length > 0) await cpRepo.incrementTimesUsed(bankIds);
  }
  return picked.map(present);
};

module.exports = { create, detail, update, deactivate, list, sampleForCandidate, present };
