'use strict';

const adminRepository = require('../repositories/adminRepository');
const ApiError = require('../utils/ApiError');
const { signAccessToken } = require('../utils/jwt');
const env = require('../config/env');

const sanitize = (admin) => ({
  id: admin.id,
  name: admin.name,
  email: admin.email,
  role: admin.role,
  hrNotificationEmail: admin.hrNotificationEmail,
  lastLoginAt: admin.lastLoginAt,
});

const register = async ({ name, email, password, hrNotificationEmail }) => {
  if (!env.admin.allowRegister) {
    throw ApiError.forbidden('Admin registration is disabled', { code: 'E_REGISTER_DISABLED' });
  }
  const existing = await adminRepository.exists({ email: String(email).toLowerCase() });
  if (existing) throw ApiError.conflict('An admin with that email already exists');
  const admin = await adminRepository.create({ name, email, password, hrNotificationEmail });
  const token = signAccessToken({ sub: admin.id, role: admin.role });
  return { token, admin: sanitize(admin) };
};

const login = async ({ email, password }) => {
  const admin = await adminRepository.findByEmail(email, { withPassword: true });
  if (!admin) throw ApiError.unauthorized('Invalid credentials');
  const ok = await admin.comparePassword(password);
  if (!ok) throw ApiError.unauthorized('Invalid credentials');
  await adminRepository.updateLastLogin(admin.id);
  const token = signAccessToken({ sub: admin.id, role: admin.role });
  return { token, admin: sanitize(admin) };
};

const me = async (id) => {
  const admin = await adminRepository.findById(id);
  if (!admin) throw ApiError.notFound('Admin not found');
  return sanitize(admin);
};

module.exports = { register, login, me, sanitize };
