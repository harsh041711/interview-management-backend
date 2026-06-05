'use strict';

const CodingProblem = require('../models/CodingProblem');

const create = (data) => CodingProblem.create(data);

const findById = (id) => CodingProblem.findById(id);

const updateById = (id, update) =>
  CodingProblem.findByIdAndUpdate(id, update, { new: true });

const list = async ({ page = 1, limit = 20, search, difficulty, language, source, isActive } = {}) => {
  const filter = {};
  if (isActive !== undefined && isActive !== null) filter.isActive = isActive;
  if (difficulty) filter.difficulty = difficulty;
  if (source) filter.source = source;
  if (language) filter.supportedLanguages = language;
  if (search) {
    const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ title: rx }, { techStack: rx }];
  }
  const skip = (Math.max(1, page) - 1) * limit;
  const [items, total] = await Promise.all([
    CodingProblem.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit),
    CodingProblem.countDocuments(filter),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
};

const sampleActive = ({ techStacks, difficulty, limit }) =>
  CodingProblem.find({
    isActive: true,
    techStack: { $in: techStacks },
    difficulty,
  })
    .sort({ timesUsed: 1, updatedAt: -1 })
    .limit(limit);

const incrementTimesUsed = (ids) =>
  CodingProblem.updateMany({ _id: { $in: ids } }, { $inc: { timesUsed: 1 } });

module.exports = { create, findById, updateById, list, sampleActive, incrementTimesUsed };
