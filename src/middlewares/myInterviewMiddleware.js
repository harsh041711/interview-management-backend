'use strict';
const interviewRepository = require('../repositories/interviewRepository');
const ApiError = require('../utils/ApiError');

const requireMyInterview = async (req, _res, next) => {
  try {
    const interview = await interviewRepository.findByIdPopulated(req.params.id);
    if (!interview) throw ApiError.notFound('Interview not found');
    const interviewerId = interview.interviewer && (interview.interviewer._id || interview.interviewer);
    if (String(interviewerId) !== String(req.user.id)) {
      throw ApiError.forbidden('Not your interview', { code: 'E_FORBIDDEN' });
    }
    req.interview = interview;
    next();
  } catch (err) { next(err); }
};

module.exports = { requireMyInterview };
