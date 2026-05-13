'use strict';

const jdRepo = require('../repositories/jobDescriptionRepository');
const ApiError = require('../utils/ApiError');

const present = (doc) => ({
  id: doc.id,
  title: doc.title,
  techStack: doc.techStack,
  experience: doc.experience,
  jobRole: doc.jobRole,
  responsibilities: doc.responsibilities,
  qualifications: doc.qualifications,
  niceToHave: doc.niceToHave || '',
  minYears: doc.minYears ?? null,
  maxYears: doc.maxYears ?? null,
  location: doc.location || '',
  isActive: doc.isActive,
  createdBy: doc.createdBy,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

const create = async (payload, adminId) => {
  const techStack = String(payload.techStack || '').toLowerCase().trim();
  const existing = await jdRepo.findActiveByCombo(techStack, payload.experience);
  if (existing) {
    throw ApiError.conflict(
      `An active JD already exists for ${techStack} / ${payload.experience}. Deactivate it first.`,
      { code: 'E_JD_DUPLICATE' },
    );
  }
  const doc = await jdRepo.create({ ...payload, techStack, createdBy: adminId });
  return present(doc);
};

const update = async (id, updates) => {
  const doc = await jdRepo.findById(id);
  if (!doc) throw ApiError.notFound('JD not found');

  const nextStack = updates.techStack
    ? String(updates.techStack).toLowerCase().trim()
    : doc.techStack;
  const nextExp = updates.experience || doc.experience;
  const nextActive = updates.isActive !== undefined ? updates.isActive : doc.isActive;
  if (nextActive && (nextStack !== doc.techStack || nextExp !== doc.experience)) {
    const conflict = await jdRepo.findActiveByCombo(nextStack, nextExp);
    if (conflict && String(conflict._id) !== String(doc._id)) {
      throw ApiError.conflict(
        `Another active JD already exists for ${nextStack} / ${nextExp}`,
        { code: 'E_JD_DUPLICATE' },
      );
    }
  }
  if (updates.techStack) updates.techStack = nextStack;
  const updated = await jdRepo.updateById(id, updates);
  return present(updated);
};

const detail = async (id) => {
  const doc = await jdRepo.findById(id);
  if (!doc) throw ApiError.notFound('JD not found');
  return present(doc);
};

const list = async (query) => {
  const result = await jdRepo.list(query);
  return { ...result, items: result.items.map(present) };
};

const deactivate = async (id) => {
  const doc = await jdRepo.findById(id);
  if (!doc) throw ApiError.notFound('JD not found');
  const updated = await jdRepo.updateById(id, { isActive: false });
  return present(updated);
};

const lookup = async (techStack, experience) => {
  const doc = await jdRepo.findActiveByCombo(techStack, experience);
  return doc ? present(doc) : null;
};

module.exports = { create, update, detail, list, deactivate, lookup, present };
