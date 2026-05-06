'use strict';

const { configureCloudinary, isCloudinaryReady } = require('../config/cloudinary');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');

const uploadBufferToCloudinary = (buffer, { folder, publicId, resourceType = 'image', tags } = {}) => {
  const cl = configureCloudinary();
  if (!isCloudinaryReady()) {
    return Promise.reject(ApiError.internal('Cloudinary is not configured', { code: 'E_CLOUDINARY' }));
  }
  return new Promise((resolve, reject) => {
    const stream = cl.uploader.upload_stream(
      {
        folder: folder || env.cloudinary.folder,
        public_id: publicId,
        resource_type: resourceType,
        overwrite: true,
        tags,
      },
      (err, result) => {
        if (err) {
          logger.error('Cloudinary upload failed', { err: err.message });
          return reject(ApiError.internal('Image upload failed', { code: 'E_UPLOAD_FAIL' }));
        }
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          width: result.width,
          height: result.height,
          format: result.format,
          bytes: result.bytes,
        });
      },
    );
    stream.end(buffer);
  });
};

const destroyAsset = async (publicId) => {
  if (!publicId) return;
  const cl = configureCloudinary();
  if (!isCloudinaryReady()) return;
  try {
    await cl.uploader.destroy(publicId, { invalidate: true });
  } catch (err) {
    logger.warn('Cloudinary destroy failed', { publicId, err: err.message });
  }
};

module.exports = { uploadBufferToCloudinary, destroyAsset };
