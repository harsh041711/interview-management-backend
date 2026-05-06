'use strict';

const multer = require('multer');
const ApiError = require('../utils/ApiError');

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 5 * 1024 * 1024;

const fileFilter = (_req, file, cb) => {
  if (!ALLOWED_MIME.has(file.mimetype)) {
    return cb(ApiError.badRequest('Only JPEG, PNG, or WEBP images are allowed', { code: 'E_FILE_TYPE' }));
  }
  cb(null, true);
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter,
});

const singlePhoto = (field = 'photo') => (req, res, next) =>
  upload.single(field)(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const map = {
        LIMIT_FILE_SIZE: 'File too large (max 5MB)',
        LIMIT_FILE_COUNT: 'Too many files',
        LIMIT_UNEXPECTED_FILE: `Unexpected field "${err.field}" — expected "${field}"`,
      };
      return next(ApiError.badRequest(map[err.code] || err.message, { code: `E_UPLOAD_${err.code}` }));
    }
    return next(err);
  });

module.exports = { singlePhoto, MAX_BYTES };
