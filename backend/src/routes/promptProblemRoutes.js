'use strict';
const express = require('express');
const validate = require('../middlewares/validator');
const { requireAuth, requireRole } = require('../middlewares/authMiddleware');
const ctrl = require('../controllers/promptProblemController');
const v = require('../validators/promptProblemValidator');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

router.get('/',       validate(v.listSchema),    ctrl.list);
router.post('/',      validate(v.createSchema),  ctrl.create);
router.get('/:id',    validate(v.idParamSchema), ctrl.detail);
router.patch('/:id',  validate(v.updateSchema),  ctrl.update);
router.delete('/:id', validate(v.idParamSchema), ctrl.remove);

module.exports = router;
