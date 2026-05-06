'use strict';

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const required = (key, { fallback, allowEmpty = false } = {}) => {
  const raw = process.env[key];
  if (raw === undefined || (!allowEmpty && raw === '')) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required env var: ${key}`);
  }
  return raw;
};

const optional = (key, fallback) =>
  process.env[key] !== undefined && process.env[key] !== '' ? process.env[key] : fallback;

const toBool = (val, fallback = false) => {
  if (val === undefined) return fallback;
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(val).toLowerCase());
};

const toInt = (val, fallback) => {
  const n = parseInt(val, 10);
  return Number.isFinite(n) ? n : fallback;
};

const toList = (val, fallback = []) =>
  val ? String(val).split(',').map((s) => s.trim()).filter(Boolean) : fallback;

const env = {
  nodeEnv: optional('NODE_ENV', 'development'),
  isProduction: optional('NODE_ENV', 'development') === 'production',
  port: toInt(process.env.PORT, 5000),
  apiPrefix: optional('API_PREFIX', '/api/v1'),
  appName: optional('APP_NAME', 'Interview Management System'),
  frontendUrl: optional('FRONTEND_URL', 'http://localhost:5173'),
  corsOrigins: toList(process.env.CORS_ORIGINS, ['http://localhost:5173']),

  mongo: {
    uri: required('MONGODB_URI'),
  },

  jwt: {
    secret: required('JWT_SECRET'),
    expiresIn: optional('JWT_EXPIRES_IN', '7d'),
  },

  testToken: {
    secret: required('TEST_TOKEN_SECRET'),
    expiryMinutes: toInt(process.env.TEST_LINK_EXPIRY_MINUTES, 60),
  },

  test: {
    defaultDurationMinutes: toInt(process.env.DEFAULT_TEST_DURATION_MINUTES, 60),
  },

  admin: {
    allowRegister: toBool(process.env.ALLOW_ADMIN_REGISTER, false),
    seed: {
      name: optional('SEED_ADMIN_NAME', 'Admin'),
      email: optional('SEED_ADMIN_EMAIL'),
      password: optional('SEED_ADMIN_PASSWORD'),
      hrEmail: optional('SEED_ADMIN_HR_EMAIL'),
    },
  },

  cloudinary: {
    cloudName: optional('CLOUDINARY_CLOUD_NAME'),
    apiKey: optional('CLOUDINARY_API_KEY'),
    apiSecret: optional('CLOUDINARY_API_SECRET'),
    folder: optional('CLOUDINARY_FOLDER', 'interview_management/candidates'),
  },

  ai: {
    requestTimeoutMs: toInt(process.env.AI_REQUEST_TIMEOUT_MS, 15_000),
    gemini: {
      apiKey: optional('GEMINI_API_KEY'),
    },
    groq: {
      apiKey: optional('GROQ_API_KEY'),
    },
  },

  smtp: {
    host: optional('SMTP_HOST'),
    port: toInt(process.env.SMTP_PORT, 587),
    secure: toBool(process.env.SMTP_SECURE, false),
    user: optional('SMTP_USER'),
    password: optional('SMTP_PASSWORD'),
    from: optional('EMAIL_FROM', 'no-reply@example.com'),
  },

  rateLimit: {
    windowMs: toInt(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
    max: toInt(process.env.RATE_LIMIT_MAX, 100),
    loginMax: toInt(process.env.LOGIN_RATE_LIMIT_MAX, 5),
  },
};

module.exports = env;
