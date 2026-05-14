'use strict';
const express = require('express');
const router = express.Router({ mergeParams: true });
const ctrl = require('../controllers/promptTestAdminController');
const validate = require('../middlewares/validator');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');
const v = require('../validators/promptTestValidator');

router.use(requireAuth, requireRole('admin'));

router.post('/assign',         validate(v.assignSchema),        ctrl.assign);
router.post('/generate',       validate(v.generateSchema),      ctrl.generate);
router.post('/save-generated', validate(v.saveGeneratedSchema), ctrl.saveGenerated);
router.get('/submission',      validate({ params: v.assignSchema.params }), ctrl.getSubmission);
router.post('/reevaluate',     validate({ params: v.assignSchema.params }), ctrl.reevaluate);

module.exports = router;
