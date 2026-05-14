'use strict';
const LiveSession = require('../models/LiveSession');

const create = (data) => LiveSession.create(data);

const findActiveByInterview = (interviewId) =>
  LiveSession.findOne({ interview: interviewId, endedAt: null }).sort({ createdAt: -1 });

const findById = (id) => LiveSession.findById(id);

const updateById = (id, patch) =>
  LiveSession.findByIdAndUpdate(id, patch, { new: true });

const applyQuestionUpdates = async (id, updates) => {
  // updates: [{ index, askedAt?, note?, rating? }]
  const setOps = {};
  for (const u of updates) {
    const i = Number(u.index);
    if (!Number.isInteger(i) || i < 0) continue;
    if (Object.prototype.hasOwnProperty.call(u, 'askedAt')) setOps[`questions.${i}.askedAt`] = u.askedAt;
    if (Object.prototype.hasOwnProperty.call(u, 'note')) setOps[`questions.${i}.note`] = u.note;
    if (Object.prototype.hasOwnProperty.call(u, 'rating')) setOps[`questions.${i}.rating`] = u.rating;
  }
  if (!Object.keys(setOps).length) return LiveSession.findById(id);
  return LiveSession.findByIdAndUpdate(id, { $set: setOps }, { new: true });
};

module.exports = { create, findActiveByInterview, findById, updateById, applyQuestionUpdates };
