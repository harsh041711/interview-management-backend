'use strict';

const adminRepository = require('../repositories/adminRepository');
const interviewerRepository = require('../repositories/interviewerRepository');
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

const sanitizeInterviewer = (interviewer) => ({
  id: interviewer.id,
  name: interviewer.name,
  email: interviewer.email,
  role: 'interviewer',
  expertise: interviewer.expertise,
  isActive: interviewer.isActive,
  lastLoginAt: interviewer.lastLoginAt,
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
  // Try admin login first
  const admin = await adminRepository.findByEmail(email, { withPassword: true });
  if (admin) {
    const ok = await admin.comparePassword(password);
    if (ok) {
      await adminRepository.updateLastLogin(admin.id);
      const token = signAccessToken({ sub: admin.id, role: admin.role });
      return { token, user: sanitize(admin) };
    }
  }

  // Try interviewer login
  const interviewer = await interviewerRepository.findByEmailWithPassword(email);
  if (interviewer) {
    if (!interviewer.isActive) {
      throw ApiError.forbidden('Account inactive', { code: 'E_ACCOUNT_INACTIVE' });
    }
    if (!interviewer.passwordHash) {
      throw ApiError.unauthorized('Account not yet set up', { code: 'E_ACCOUNT_NOT_SET_UP' });
    }
    const ok = await interviewer.comparePassword(password);
    if (ok) {
      await interviewerRepository.updateLastLogin(interviewer.id);
      const token = signAccessToken({ sub: interviewer.id, role: 'interviewer' });
      return { token, user: sanitizeInterviewer(interviewer) };
    }
  }

  // No match found
  throw ApiError.unauthorized('Invalid credentials', { code: 'E_INVALID_CREDENTIALS' });
};

const me = async (id) => {
  const admin = await adminRepository.findById(id);
  if (!admin) throw ApiError.notFound('Admin not found');
  return sanitize(admin);
};

module.exports = { register, login, me, sanitize };
