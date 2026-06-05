'use strict';

const multer = require('multer');
const ApiError = require('../utils/ApiError');

const ALLOWED_PHOTO_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_RESUME_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const MAX_BYTES = 5 * 1024 * 1024;

const photoFilter = (_req, file, cb) => {
  if (!ALLOWED_PHOTO_MIME.has(file.mimetype)) {
    return cb(ApiError.badRequest('Only JPEG, PNG, or WEBP images are allowed', { code: 'E_FILE_TYPE' }));
  }
  cb(null, true);
};

const resumeFilter = (_req, file, cb) => {
  if (!ALLOWED_RESUME_MIME.has(file.mimetype)) {
    return cb(ApiError.badRequest('Only PDF, DOC, or DOCX files are allowed', { code: 'E_FILE_TYPE' }));
  }
  cb(null, true);
};

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: photoFilter,
});

const resumeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: resumeFilter,
});

const wrapSingle = (instance, field) => (req, res, next) =>
  instance.single(field)(req, res, (err) => {
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

const singlePhoto = (field = 'photo') => wrapSingle(photoUpload, field);
const singleResume = (field = 'resume') => wrapSingle(resumeUpload, field);

module.exports = { singlePhoto, singleResume, MAX_BYTES };
