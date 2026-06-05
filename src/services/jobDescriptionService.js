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

// Split a stored techStack (single tag OR comma-separated list) into lowercased tags.
const tokenize = (value) =>
  String(value || '')
    .toLowerCase()
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

// Pure: choose the best JD for a candidate from a list of active JDs.
// A JD is a candidate if ANY of its tags overlaps ANY candidate tag.
// Ranking: prefer a JD whose experience matches the candidate's, then the
// JD with the greatest skill overlap. Experience is relaxed — a skills-only
// match still wins over no match at all.
const pickBestMatch = (jds, candidateStacks, experience) => {
  const candTokens = new Set(
    (Array.isArray(candidateStacks) ? candidateStacks : [])
      .map((s) => String(s).toLowerCase().trim())
      .filter(Boolean),
  );
  if (!candTokens.size) return null;

  const ranked = (Array.isArray(jds) ? jds : [])
    .map((jd) => ({
      jd,
      overlap: tokenize(jd.techStack).filter((t) => candTokens.has(t)).length,
      expMatch: jd.experience === experience ? 1 : 0,
    }))
    .filter((x) => x.overlap > 0)
    .sort((a, b) => b.expMatch - a.expMatch || b.overlap - a.overlap);

  return ranked.length ? ranked[0].jd : null;
};

// Find the best active JD for a candidate across all of their tech-stack tags,
// matching on any skill overlap and relaxing the experience requirement.
const findBestMatch = async (candidateStacks, experience) => {
  const actives = await jdRepo.listActive();
  const best = pickBestMatch(actives, candidateStacks, experience);
  return best ? present(best) : null;
};

module.exports = {
  create,
  update,
  detail,
  list,
  deactivate,
  lookup,
  tokenize,
  pickBestMatch,
  findBestMatch,
  present,
};
