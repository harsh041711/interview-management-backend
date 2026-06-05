'use strict';

const Candidate = require('../models/Candidate');

const create = (data) => Candidate.create(data);

const findById = (id) => Candidate.findById(id);

const findByTestToken = (token) => Candidate.findOne({ testToken: token });

const findByCodingTestToken = (token) =>
  require('../models/Candidate').findOne({ 'codingTest.token': token });

const updateById = (id, update) => Candidate.findByIdAndUpdate(id, update, { new: true });

const deleteById = (id) => Candidate.findByIdAndDelete(id);

const list = async ({ page = 1, limit = 20, status, search, techStack } = {}) => {
  const filter = {};
  if (status) filter.status = status;
  if (techStack) filter.techStack = techStack;
  if (search) {
    const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { email: rx }];
  }
  const skip = (Math.max(1, page) - 1) * limit;
  const [items, total] = await Promise.all([
    Candidate.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Candidate.countDocuments(filter),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
};

const countByStatus = async () => {
  const rows = await Candidate.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
  return rows.reduce((acc, row) => ({ ...acc, [row._id]: row.count }), {});
};

module.exports = {
  create,
  findById,
  findByTestToken,
  findByCodingTestToken,
  updateById,
  deleteById,
  list,
  countByStatus,
};
