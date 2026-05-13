'use strict';

const JobDescription = require('../models/JobDescription');

const create = (data) => JobDescription.create(data);

const findById = (id) => JobDescription.findById(id);

const findActiveByCombo = (techStack, experience) =>
  JobDescription.findOne({
    techStack: String(techStack || '').toLowerCase().trim(),
    experience,
    isActive: true,
  });

const updateById = (id, update) =>
  JobDescription.findByIdAndUpdate(id, update, { new: true });

const list = async ({ page = 1, limit = 20, search, experience, isActive } = {}) => {
  const filter = {};
  if (isActive !== undefined && isActive !== null) filter.isActive = isActive;
  if (experience) filter.experience = experience;
  if (search) {
    const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ title: rx }, { techStack: rx }];
  }
  const skip = (Math.max(1, page) - 1) * limit;
  const [items, total] = await Promise.all([
    JobDescription.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit),
    JobDescription.countDocuments(filter),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
};

module.exports = { create, findById, findActiveByCombo, updateById, list };
