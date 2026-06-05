'use strict';

const express = require('express');
const validate = require('../middlewares/validator');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');
const jdController = require('../controllers/jobDescriptionController');
const {
  createJdSchema, updateJdSchema, idParamSchema, listJdsSchema, lookupJdSchema,
} = require('../validators/jobDescriptionValidator');

const router = express.Router();

router.use(requireAuth, requireRole('admin'));

router.post('/', validate(createJdSchema), jdController.createJd);
router.get('/', validate(listJdsSchema), jdController.listJds);
router.get('/lookup', validate(lookupJdSchema), jdController.lookupJd);
router.get('/:id', validate(idParamSchema), jdController.getJd);
router.patch('/:id', validate(updateJdSchema), jdController.updateJd);
router.delete('/:id', validate(idParamSchema), jdController.deactivateJd);

module.exports = router;
