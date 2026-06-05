'use strict';
const express = require('express');
const validate = require('../middlewares/validator');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');
const ctrl = require('../controllers/reviewEditRequestController');
const { listSchema, decideSchema } = require('../validators/reviewEditRequestValidator');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

router.get('/', validate(listSchema), ctrl.list);
router.post('/:id/decide', validate(decideSchema), ctrl.decide);

module.exports = router;
