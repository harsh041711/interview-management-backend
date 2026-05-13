'use strict';

const mongoose = require('mongoose');

const googleIntegrationSchema = new mongoose.Schema(
  {
    accountEmail: { type: String, required: true },
    accessToken: { type: String, required: true },
    refreshToken: { type: String, required: true },
    accessTokenExpiresAt: { type: Date, required: true },
    scope: { type: String, default: '' },
    connectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.__v;
        // Never leak tokens through JSON serialisation.
        delete ret.accessToken;
        delete ret.refreshToken;
        return ret;
      },
    },
  },
);

module.exports = mongoose.model('GoogleIntegration', googleIntegrationSchema);
