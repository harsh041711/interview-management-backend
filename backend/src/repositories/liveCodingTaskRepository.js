'use strict';
const LiveCodingTask = require('../models/LiveCodingTask');

const create = (data) => LiveCodingTask.create(data);

const findById = (id) => LiveCodingTask.findById(id);

const findByToken = (token) => LiveCodingTask.findOne({ token });

const listByInterview = (interviewId) =>
  LiveCodingTask.find({ interview: interviewId }).sort({ createdAt: -1 });

const updateById = (id, patch) =>
  LiveCodingTask.findByIdAndUpdate(id, patch, { new: true });

module.exports = { create, findById, findByToken, listByInterview, updateById };
