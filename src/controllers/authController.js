'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/ApiResponse');
const authService = require('../services/authService');
const accountSetupService = require('../services/accountSetupService');
const emailService = require('../services/emailService');
const env = require('../config/env');
const { signAccessToken } = require('../utils/jwt');
const interviewerRepository = require('../repositories/interviewerRepository');
const logger = require('../config/logger');

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

const buildSetupUrl = (token) =>
  `${env.frontendUrl.replace(/\/$/, '')}/account/setup/${token}`;

const forgotPassword = asyncHandler(async (req, res) => {
  const result = await accountSetupService.issueToken({
    email: req.body.email,
    purpose: 'forgot_password',
  });
  if (result && result.token) {
    setImmediate(async () => {
      try {
        await emailService.sendAccountSetup({
          interviewer: { name: result.name, email: result.email },
          setupUrl: buildSetupUrl(result.token),
          purpose: 'forgot_password',
          expiresAt: result.expiresAt,
        });
      } catch (err) {
        logger.error('Forgot-password email failed', { err: err.message });
      }
    });
  }
  return ok(res, { sent: true }, 'If the email exists, a reset link has been sent');
});

const getAccountSetup = asyncHandler(async (req, res) => {
  const data = await accountSetupService.validateToken(req.params.token);
  return ok(res, data, 'Token valid');
});

const postAccountSetup = asyncHandler(async (req, res) => {
  const interviewer = await accountSetupService.consumeTokenAndSetPassword(
    req.body.token, req.body.password,
  );
  await interviewerRepository.updateLastLogin(interviewer.id);
  const token = signAccessToken({ sub: interviewer.id, role: 'interviewer' });
  return ok(res, {
    token,
    user: { id: interviewer.id, name: interviewer.name, email: interviewer.email, role: 'interviewer' },
  }, 'Account ready');
});

module.exports = { register, login, me, forgotPassword, getAccountSetup, postAccountSetup };
