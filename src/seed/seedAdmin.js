'use strict';

const env = require('../config/env');
const { connectDB, disconnectDB } = require('../config/db');
const adminRepository = require('../repositories/adminRepository');
const logger = require('../config/logger');

const run = async () => {
  const { name, email, password, hrEmail } = env.admin.seed;
  if (!email || !password) {
    logger.error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env before seeding.');
    process.exit(1);
  }
  await connectDB();
  const existing = await adminRepository.findByEmail(email);
  if (existing) {
    logger.info('Admin already exists, skipping seed.', { email });
  } else {
    const admin = await adminRepository.create({
      name,
      email,
      password,
      hrNotificationEmail: hrEmail || email,
    });
    logger.info('Seed admin created.', { id: admin.id, email: admin.email });
  }
  await disconnectDB();
  process.exit(0);
};

run().catch((err) => {
  logger.error('Seed failed', { err: err.message, stack: err.stack });
  process.exit(1);
});
