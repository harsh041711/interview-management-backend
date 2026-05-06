'use strict';

const TestSession = require('../models/TestSession');

const create = (data) => TestSession.create(data);

const findById = (id) => TestSession.findById(id);

const findByCandidate = (candidateId) => TestSession.findOne({ candidate: candidateId });

const updateById = (id, update) => TestSession.findByIdAndUpdate(id, update, { new: true });

const pushCheatEvent = (id, event) =>
  TestSession.findByIdAndUpdate(id, { $push: { cheatEvents: event } }, { new: true });

const findByIdPopulated = (id) =>
  TestSession.findById(id).populate('questions').populate('candidate');

module.exports = { create, findById, findByCandidate, updateById, pushCheatEvent, findByIdPopulated };
