'use strict';
const PromptProblem = require('../models/PromptProblem');

const create = (data) => PromptProblem.create(data);
const findById = (id) => PromptProblem.findById(id);

// Library list excludes candidate-specific problems
const listLibrary = async ({ page = 1, limit = 20, difficulty, q } = {}) => {
  const filter = { createdFor: null };
  if (difficulty) filter.difficulty = difficulty;
  if (q) filter.title = { $regex: q, $options: 'i' };
  const skip = (Math.max(1, page) - 1) * limit;
  const [items, total] = await Promise.all([
    PromptProblem.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    PromptProblem.countDocuments(filter),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
};

const updateById = (id, patch) => PromptProblem.findByIdAndUpdate(id, patch, { new: true });
const deleteById = (id) => PromptProblem.findByIdAndDelete(id);

module.exports = { create, findById, listLibrary, updateById, deleteById };
