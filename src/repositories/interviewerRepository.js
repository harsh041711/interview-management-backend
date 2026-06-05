'use strict';

const Interviewer = require('../models/Interviewer');

const create = (data) => Interviewer.create(data);

const findById = (id) => Interviewer.findById(id);

const findByEmail = (email) => Interviewer.findOne({ email: String(email).toLowerCase().trim() });

const updateById = (id, update) => Interviewer.findByIdAndUpdate(id, update, { new: true });

const deleteById = (id) => Interviewer.findByIdAndDelete(id);

const list = async ({ page = 1, limit = 20, search, isActive } = {}) => {
  const filter = {};
  if (isActive !== undefined && isActive !== null) filter.isActive = isActive;
  if (search) {
    const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { email: rx }];
  }
  const skip = (Math.max(1, page) - 1) * limit;
  const [items, total] = await Promise.all([
    Interviewer.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Interviewer.countDocuments(filter),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
};

const countActive = () => Interviewer.countDocuments({ isActive: true });

const findBySetupTokenHash = (tokenHash) => Interviewer.findOne({ setupTokenHash: tokenHash });

const saveSetupToken = (id, { tokenHash, expiresAt, purpose }) =>
  Interviewer.findByIdAndUpdate(
    id,
    { setupTokenHash: tokenHash, setupTokenExpiresAt: expiresAt, setupTokenPurpose: purpose },
    { new: true },
  );

const setPassword = (id, { passwordHash, passwordSetAt }) =>
  Interviewer.findByIdAndUpdate(
    id,
    {
      passwordHash,
      passwordSetAt,
      setupTokenHash: null,
      setupTokenExpiresAt: null,
      setupTokenPurpose: null,
    },
    { new: true },
  );

const findByEmailWithPassword = (email) =>
  Interviewer.findOne({ email: (email || '').toLowerCase() }).select('+passwordHash');

const updateLastLogin = (id) =>
  Interviewer.findByIdAndUpdate(id, { lastLoginAt: new Date() });

module.exports = {
  create,
  findById,
  findByEmail,
  updateById,
  deleteById,
  list,
  countActive,
  findBySetupTokenHash,
  saveSetupToken,
  setPassword,
  findByEmailWithPassword,
  updateLastLogin,
};
