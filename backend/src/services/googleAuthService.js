'use strict';

const jwt = require('jsonwebtoken');
const { google } = require('googleapis');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

const STATE_TTL_SECONDS = 10 * 60; // 10 minutes

const isConfigured = () =>
  Boolean(env.google.clientId && env.google.clientSecret && env.google.redirectUri);

const requireConfigured = () => {
  if (!isConfigured()) {
    throw new ApiError(500, 'Google OAuth is not configured on this server', {
      code: 'E_GOOGLE_NOT_CONFIGURED',
    });
  }
};

const oauthClient = () => {
  requireConfigured();
  return new google.auth.OAuth2(env.google.clientId, env.google.clientSecret, env.google.redirectUri);
};

const signState = () =>
  jwt.sign({ purpose: 'google_oauth' }, env.jwt.secret, { expiresIn: STATE_TTL_SECONDS });

const verifyState = (state) => {
  try {
    const payload = jwt.verify(state, env.jwt.secret);
    return payload?.purpose === 'google_oauth';
  } catch {
    return false;
  }
};

const buildAuthUrl = () => {
  const client = oauthClient();
  const state = signState();
  const url = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // force refresh_token issuance even if user previously consented
    scope: env.google.scopes,
    state,
  });
  return { url, state };
};

const exchangeCode = async (code) => {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new ApiError(
      400,
      'Google did not return a refresh token. Revoke the previous grant in Google Account permissions and reconnect.',
      { code: 'E_GOOGLE_NO_REFRESH_TOKEN' },
    );
  }
  client.setCredentials(tokens);
  // Fetch the email via the userinfo endpoint
  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const { data: profile } = await oauth2.userinfo.get();
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    accessTokenExpiresAt: new Date(tokens.expiry_date),
    scope: tokens.scope || '',
    accountEmail: profile.email,
  };
};

const refreshAccessToken = async (refreshToken) => {
  const client = oauthClient();
  client.setCredentials({ refresh_token: refreshToken });
  try {
    const { credentials } = await client.refreshAccessToken();
    return {
      accessToken: credentials.access_token,
      accessTokenExpiresAt: new Date(credentials.expiry_date),
    };
  } catch (err) {
    const errCode = err?.response?.data?.error || err?.message || '';
    if (String(errCode).includes('invalid_grant')) {
      throw new ApiError(401, 'Google refused the refresh token (user may have revoked access)', {
        code: 'E_GOOGLE_TOKEN_REVOKED',
      });
    }
    throw err;
  }
};

module.exports = {
  isConfigured,
  buildAuthUrl,
  verifyState,
  exchangeCode,
  refreshAccessToken,
};
