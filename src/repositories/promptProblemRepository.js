'use strict';
const PromptProblem = require('../models/PromptProblem');

const create = (data) => PromptProblem.create(data);
const findById = (id) => PromptProblem.findById(id);

// Lists every prompt problem — manual library entries and AI-generated
// candidate-specific ones. Admin can scope with the `scope` query param:
//   scope=library      -> only reusable (createdFor: null)
//   scope=personalized -> only AI-generated for a specific candidate
//   scope=all (default) -> both
// `createdFor` is populated with the candidate's name so the UI can show
// which candidate a personalized problem was generated for.
const listLibrary = async ({ page = 1, limit = 20, difficulty, q, scope = 'all' } = {}) => {
  const filter = {};
  if (scope === 'library') filter.createdFor = null;
  else if (scope === 'personalized') filter.createdFor = { $ne: null };
  if (difficulty) filter.difficulty = difficulty;
  if (q) filter.title = { $regex: q, $options: 'i' };
  const skip = (Math.max(1, page) - 1) * limit;
  const [items, total] = await Promise.all([
    PromptProblem.find(filter)
      .populate('createdFor', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    PromptProblem.countDocuments(filter),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
};

const updateById = (id, patch) => PromptProblem.findByIdAndUpdate(id, patch, { new: true });
const deleteById = (id) => PromptProblem.findByIdAndDelete(id);

module.exports = { create, findById, listLibrary, updateById, deleteById };
