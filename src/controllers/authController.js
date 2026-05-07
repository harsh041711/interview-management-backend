'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/ApiResponse');
const authService = require('../services/authService');

const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body);
  return created(res, result, 'Admin registered');
});

const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);
  return ok(res, result, 'Login successful');
});

const me = asyncHandler(async (req, res) => {
  const admin = await authService.me(req.admin.id);
  return ok(res, { admin }, 'Profile fetched');
});

module.exports = { register, login, me };
