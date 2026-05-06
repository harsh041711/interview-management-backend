'use strict';

const Admin = require('../models/Admin');

const create = (data) => Admin.create(data);

const findById = (id) => Admin.findById(id);

const findByEmail = (email, { withPassword = false } = {}) => {
  const query = Admin.findOne({ email: String(email).toLowerCase().trim() });
  if (withPassword) query.select('+password');
  return query;
};

const exists = (filter) => Admin.exists(filter);

const updateLastLogin = (id) => Admin.findByIdAndUpdate(id, { lastLoginAt: new Date() }, { new: true });

const updateById = (id, update) => Admin.findByIdAndUpdate(id, update, { new: true });

module.exports = { create, findById, findByEmail, exists, updateLastLogin, updateById };
