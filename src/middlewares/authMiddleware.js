'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { verifyAccessToken } = require('../utils/jwt');
const adminRepository = require('../repositories/adminRepository');

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

  const admin = await adminRepository.findById(payload.sub);
  if (!admin) throw ApiError.unauthorized('Account no longer exists');

  req.admin = admin;
  req.auth = { id: admin.id, role: admin.role };

  // Populate req.user with role-aware structure
  const role = payload.role || 'admin'; // backward compat: default missing role to 'admin'
  req.user = { id: payload.sub, role };

  // Backward compat: keep req.admin populated for admin role so existing handlers keep working
  if (role === 'admin') {
    req.admin = req.admin || { id: req.user.id, role: 'admin' };
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
