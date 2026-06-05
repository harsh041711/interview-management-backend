'use strict';

const { randomUUID } = require('crypto');
const { google } = require('googleapis');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const gIntegrationRepo = require('../repositories/googleIntegrationRepository');
const googleAuthService = require('./googleAuthService');

const REFRESH_SKEW_MS = 60 * 1000;

const getAccessToken = async () => {
  const integration = await gIntegrationRepo.findCurrent();
  if (!integration) {
    throw new ApiError(412, 'Google Calendar is not connected', { code: 'E_GOOGLE_NOT_CONNECTED' });
  }
  const expiresAt = integration.accessTokenExpiresAt?.getTime?.() ?? 0;
  if (expiresAt - REFRESH_SKEW_MS > Date.now()) {
    return integration.accessToken;
  }
  // Refresh
  try {
    const { accessToken, accessTokenExpiresAt } = await googleAuthService.refreshAccessToken(integration.refreshToken);
    await gIntegrationRepo.upsert({ accessToken, accessTokenExpiresAt });
    return accessToken;
  } catch (err) {
    if (err.code === 'E_GOOGLE_TOKEN_REVOKED') {
      await gIntegrationRepo.clear();
    }
    throw err;
  }
};

const buildClient = async () => {
  const accessToken = await getAccessToken();
  const oauth2 = new google.auth.OAuth2(env.google.clientId, env.google.clientSecret, env.google.redirectUri);
  oauth2.setCredentials({ access_token: accessToken });
  return google.calendar({ version: 'v3', auth: oauth2 });
};

const createEvent = async ({ summary, description, startISO, endISO, attendees }) => {
  const calendar = await buildClient();
  const res = await calendar.events.insert({
    calendarId: 'primary',
    sendUpdates: 'all',
    conferenceDataVersion: 1,
    requestBody: {
      summary,
      description,
      start: { dateTime: startISO },
      end: { dateTime: endISO },
      attendees: (attendees || []).map((email) => ({ email })),
      conferenceData: {
        createRequest: {
          requestId: randomUUID(),
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
      reminders: { useDefault: true },
    },
  });
  return { id: res.data.id, hangoutLink: res.data.hangoutLink };
};

const patchEvent = async (eventId, { startISO, endISO }) => {
  const calendar = await buildClient();
  await calendar.events.patch({
    calendarId: 'primary',
    eventId,
    sendUpdates: 'all',
    requestBody: {
      start: { dateTime: startISO },
      end: { dateTime: endISO },
    },
  });
};

const deleteEvent = async (eventId) => {
  const calendar = await buildClient();
  await calendar.events.delete({
    calendarId: 'primary',
    eventId,
    sendUpdates: 'all',
  });
};

module.exports = { getAccessToken, createEvent, patchEvent, deleteEvent };
