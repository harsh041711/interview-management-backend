'use strict';

const bcrypt = require('bcryptjs');
const interviewerRepository = require('../repositories/interviewerRepository');
const { generateSetupToken, hashSetupToken } = require('../utils/setupTokenGenerator');
const ApiError = require('../utils/ApiError');
const { SETUP_TOKEN_PURPOSE, PASSWORD_MIN_LENGTH } = require('../utils/constants');

const issueToken = async ({ email, purpose }) => {
  const lower = (email || '').toLowerCase().trim();
  const interviewer = await interviewerRepository.findByEmail(lower);

  // Silent success on missing for forgot_password to avoid leaking existence;
  // initial_setup paths are admin-only callers that should know the email exists.
  if (!interviewer) {
    if (purpose === SETUP_TOKEN_PURPOSE.FORGOT_PASSWORD) return { email: lower };
    throw ApiError.notFound('Interviewer not found', { code: 'E_INTERVIEWER_NOT_FOUND' });
  }
  if (!interviewer.isActive) {
    throw ApiError.forbidden('Account inactive', { code: 'E_ACCOUNT_INACTIVE' });
  }

  const { token, tokenHash, expiresAt } = generateSetupToken();
  await interviewerRepository.saveSetupToken(interviewer.id, { tokenHash, expiresAt, purpose });
  return { email: lower, name: interviewer.name, token, expiresAt, purpose };
};

const validateToken = async (rawToken) => {
  if (!rawToken) throw ApiError.gone('Setup link invalid or expired', { code: 'E_SETUP_TOKEN_INVALID' });
  const tokenHash = hashSetupToken(rawToken);
  const interviewer = await interviewerRepository.findBySetupTokenHash(tokenHash);
  if (!interviewer || !interviewer.setupTokenExpiresAt || interviewer.setupTokenExpiresAt.getTime() < Date.now()) {
    throw ApiError.gone('Setup link invalid or expired', { code: 'E_SETUP_TOKEN_INVALID' });
  }
  if (!interviewer.isActive) {
    throw ApiError.forbidden('Account inactive', { code: 'E_ACCOUNT_INACTIVE' });
  }
  return {
    email: interviewer.email,
    name: interviewer.name,
    purpose: interviewer.setupTokenPurpose || SETUP_TOKEN_PURPOSE.INITIAL_SETUP,
  };
};

const consumeTokenAndSetPassword = async (rawToken, plainPassword) => {
  if (!plainPassword || plainPassword.length < PASSWORD_MIN_LENGTH) {
    throw ApiError.badRequest(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`, { code: 'E_WEAK_PASSWORD' });
  }
  const tokenHash = hashSetupToken(rawToken);
  const interviewer = await interviewerRepository.findBySetupTokenHash(tokenHash);
  if (!interviewer || !interviewer.setupTokenExpiresAt || interviewer.setupTokenExpiresAt.getTime() < Date.now()) {
    throw ApiError.gone('Setup link invalid or expired', { code: 'E_SETUP_TOKEN_INVALID' });
  }
  if (!interviewer.isActive) {
    throw ApiError.forbidden('Account inactive', { code: 'E_ACCOUNT_INACTIVE' });
  }
  const passwordHash = await bcrypt.hash(plainPassword, 12);
  await interviewerRepository.setPassword(interviewer.id, { passwordHash, passwordSetAt: new Date() });
  return interviewer;
};

module.exports = { issueToken, validateToken, consumeTokenAndSetPassword };
