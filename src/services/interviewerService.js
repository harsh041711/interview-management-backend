'use strict';

const interviewerRepository = require('../repositories/interviewerRepository');
const interviewRepository = require('../repositories/interviewRepository');
const ApiError = require('../utils/ApiError');
const { INTERVIEW_STATUS } = require('../utils/constants');

const presentInterviewer = (doc) => ({
  id: doc.id,
  name: doc.name,
  email: doc.email,
  expertise: doc.expertise,
  isActive: doc.isActive,
  notes: doc.notes ?? null,
  createdBy: doc.createdBy,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

const create = async ({ name, email, expertise, notes }, adminId) => {
  const existing = await interviewerRepository.findByEmail(email);
  if (existing) throw ApiError.conflict('An interviewer with that email already exists');
  const doc = await interviewerRepository.create({
    name,
    email,
    expertise: expertise || [],
    notes: notes || undefined,
    createdBy: adminId,
  });
  return presentInterviewer(doc);
};

const list = async (query) => {
  const result = await interviewerRepository.list(query);
  return {
    ...result,
    items: result.items.map(presentInterviewer),
  };
};

const detail = async (id) => {
  const doc = await interviewerRepository.findById(id);
  if (!doc) throw ApiError.notFound('Interviewer not found');
  return presentInterviewer(doc);
};

const update = async (id, updates) => {
  const doc = await interviewerRepository.findById(id);
  if (!doc) throw ApiError.notFound('Interviewer not found');

  if (updates.email && updates.email !== doc.email) {
    const conflict = await interviewerRepository.findByEmail(updates.email);
    if (conflict && String(conflict._id) !== String(doc._id)) {
      throw ApiError.conflict('Another interviewer already uses that email');
    }
  }

  const updated = await interviewerRepository.updateById(id, updates);
  return presentInterviewer(updated);
};

const remove = async (id) => {
  const doc = await interviewerRepository.findById(id);
  if (!doc) throw ApiError.notFound('Interviewer not found');

  const activeCount = await interviewRepository.countByInterviewer(id, [
    INTERVIEW_STATUS.SCHEDULED,
    INTERVIEW_STATUS.RESCHEDULE_REQUESTED,
  ]);
  if (activeCount > 0) {
    throw ApiError.conflict(
      'Interviewer has active interviews — cancel or complete them first',
      { code: 'E_INTERVIEWER_IN_USE' },
    );
  }

  await interviewerRepository.deleteById(id);
  return { id };
};

module.exports = {
  create,
  list,
  detail,
  update,
  remove,
  presentInterviewer,
};
