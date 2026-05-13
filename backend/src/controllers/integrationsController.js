'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const env = require('../config/env');
const googleAuthService = require('../services/googleAuthService');
const gIntegrationRepo = require('../repositories/googleIntegrationRepository');
const logger = require('../config/logger');

const googleConnect = asyncHandler(async (_req, res) => {
  if (!googleAuthService.isConfigured()) {
    throw new ApiError(500, 'Google OAuth is not configured on this server', {
      code: 'E_GOOGLE_NOT_CONFIGURED',
    });
  }
  const { url } = googleAuthService.buildAuthUrl();
  return ok(res, { url }, 'Authorization URL generated');
});

const googleCallback = asyncHandler(async (req, res) => {
  const { code, state, error } = req.query;
  const frontendUrl = env.frontendUrl.replace(/\/$/, '');

  // 1. User declined or Google returned an error
  if (error) {
    logger.warn('Google OAuth callback returned error', { error });
    return res.redirect(`${frontendUrl}/admin/settings?google=denied`);
  }
  // 2. Missing code or state means a bad/forged request
  if (!code || !state || !googleAuthService.verifyState(state)) {
    logger.warn('Google OAuth callback: bad state or missing code');
    return res.redirect(`${frontendUrl}/admin/settings?google=invalid_state`);
  }

  try {
    const tokens = await googleAuthService.exchangeCode(code);
    await gIntegrationRepo.upsert({
      accountEmail: tokens.accountEmail,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessTokenExpiresAt: tokens.accessTokenExpiresAt,
      scope: tokens.scope,
      connectedBy: null, // callback is unauthenticated; we don't know who clicked
    });
    return res.redirect(`${frontendUrl}/admin/settings?google=connected`);
  } catch (err) {
    logger.error('Google OAuth callback failed', { err: err.message, code: err.code });
    const reason = err.code === 'E_GOOGLE_NO_REFRESH_TOKEN' ? 'no_refresh_token' : 'exchange_failed';
    return res.redirect(`${frontendUrl}/admin/settings?google=${reason}`);
  }
});

const googleStatus = asyncHandler(async (_req, res) => {
  if (!googleAuthService.isConfigured()) {
    return ok(res, { configured: false, connected: false }, 'Google status');
  }
  const integration = await gIntegrationRepo.findCurrent();
  if (!integration) {
    return ok(res, { configured: true, connected: false }, 'Google status');
  }
  return ok(res, {
    configured: true,
    connected: true,
    accountEmail: integration.accountEmail,
    connectedAt: integration.createdAt,
  }, 'Google status');
});

const googleDisconnect = asyncHandler(async (_req, res) => {
  await gIntegrationRepo.clear();
  return ok(res, { disconnected: true }, 'Google integration disconnected');
});

module.exports = { googleConnect, googleCallback, googleStatus, googleDisconnect };
