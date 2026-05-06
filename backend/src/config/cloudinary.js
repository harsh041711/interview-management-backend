'use strict';

const { v2: cloudinary } = require('cloudinary');
const env = require('./env');
const logger = require('./logger');

let configured = false;

const configureCloudinary = () => {
  if (configured) return cloudinary;
  const { cloudName, apiKey, apiSecret } = env.cloudinary;
  if (!cloudName || !apiKey || !apiSecret) {
    logger.warn('Cloudinary credentials missing — uploads will fail until configured.');
    return cloudinary;
  }
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
  configured = true;
  logger.info('Cloudinary configured.');
  return cloudinary;
};

const isCloudinaryReady = () => {
  const { cloudName, apiKey, apiSecret } = env.cloudinary;
  return Boolean(cloudName && apiKey && apiSecret);
};

module.exports = { configureCloudinary, cloudinary, isCloudinaryReady };
