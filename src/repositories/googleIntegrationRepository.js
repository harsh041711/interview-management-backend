'use strict';

const GoogleIntegration = require('../models/GoogleIntegration');

// Singleton collection: at most one document.
const findCurrent = () => GoogleIntegration.findOne();

const upsert = (fields) =>
  GoogleIntegration.findOneAndUpdate(
    {},
    { $set: fields },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

const clear = () => GoogleIntegration.deleteMany({});

module.exports = { findCurrent, upsert, clear };
