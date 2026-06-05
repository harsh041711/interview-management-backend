'use strict';

const Question = require('../models/Question');

const create = (data) => Question.create(data);

const insertMany = (docs) => Question.insertMany(docs);

const findById = (id) => Question.findById(id);

const updateById = (id, update) => Question.findByIdAndUpdate(id, update, { new: true });

const deleteById = (id) => Question.findByIdAndDelete(id);

const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const ciExactMatchers = (values) =>
  values
    .filter((v) => typeof v === 'string' && v.trim().length > 0)
    .map((v) => new RegExp(`^${escapeRegex(v.trim())}$`, 'i'));

const list = async ({ page = 1, limit = 20, techStack, type, difficulty, isActive } = {}) => {
  const filter = {};
  if (techStack) {
    // Case-insensitive exact match so 'Node' / 'node' / 'NODE' all hit the same bucket.
    filter.techStack = new RegExp(`^${escapeRegex(String(techStack).trim())}$`, 'i');
  }
  if (type) filter.type = type;
  if (difficulty) filter.difficulty = difficulty;
  if (isActive !== undefined) filter.isActive = isActive;
  const skip = (Math.max(1, page) - 1) * limit;
  const [items, total] = await Promise.all([
    Question.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Question.countDocuments(filter),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
};

const sampleForTest = async ({ techStack, count = 10 }) => {
  const stack = Array.isArray(techStack) ? techStack : [techStack];
  const matchers = ciExactMatchers(stack);
  if (!matchers.length) return [];
  const filter = { techStack: { $in: matchers }, isActive: true };
  const docs = await Question.aggregate([
    { $match: filter },
    { $sample: { size: count } },
  ]);
  return docs.map((d) => ({ ...d, id: d._id.toString() }));
};

const distinctTechStacks = () =>
  Question.distinct('techStack', { isActive: true });

module.exports = {
  create,
  insertMany,
  findById,
  updateById,
  deleteById,
  list,
  sampleForTest,
  distinctTechStacks,
};
