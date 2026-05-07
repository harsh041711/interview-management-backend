'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { verifyAccessToken } = require('../utils/jwt');
const adminRepository = require('../repositories/adminRepository');
const interviewerRepository = require('../repositories/interviewerRepository');

const extractToken = (req) => {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  if (req.cookies?.token) return req.cookies.token;
  return null;
};

const requireAuth = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) throw ApiError.unauthorized('Authentication required');

  const payload = verifyAccessToken(token);
  if (!payload?.sub) throw ApiError.unauthorized('Invalid token payload');

  const role = payload.role || 'admin'; // backward compat: legacy tokens have no role

  if (role === 'interviewer') {
    const interviewer = await interviewerRepository.findById(payload.sub);
    if (!interviewer) throw ApiError.unauthorized('Account no longer exists');
    if (!interviewer.isActive) {
      throw ApiError.forbidden('Account inactive', { code: 'E_ACCOUNT_INACTIVE' });
    }
    req.interviewer = interviewer;
    req.auth = { id: interviewer.id, role: 'interviewer' };
    req.user = { id: interviewer.id, role: 'interviewer' };
  } else {
    const admin = await adminRepository.findById(payload.sub);
    if (!admin) throw ApiError.unauthorized('Account no longer exists');
    req.admin = admin;
    req.auth = { id: admin.id, role: admin.role || 'admin' };
    req.user = { id: admin.id, role: admin.role || 'admin' };
  }

  next();
});

const requireRole = (...allowed) => (req, _res, next) => {
  if (!req.user || !allowed.includes(req.user.role)) {
    return next(ApiError.forbidden('Forbidden', { code: 'E_FORBIDDEN_ROLE' }));
  }
  next();
};

module.exports = { requireAuth, requireRole };
