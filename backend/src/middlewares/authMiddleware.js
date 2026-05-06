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
  next();
});

const requireRole = (...roles) => (req, _res, next) => {
  if (!req.admin) return next(ApiError.unauthorized());
  if (!roles.includes(req.admin.role)) return next(ApiError.forbidden('Insufficient role'));
  next();
};

module.exports = { requireAuth, requireRole };
