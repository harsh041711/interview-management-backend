# Google Calendar Integration — Design Spec

**Date:** 2026-05-13
**Status:** Approved (brainstorm complete)
**Goal:** Replace the manual "paste Zoom/Meet URL" step in the Schedule Interview modal with automatic Google Calendar event creation. Google attaches a fresh Meet link to each event, sends native calendar invitations to candidate + interviewer, and the system keeps the event in sync as interviews are rescheduled or cancelled.

---

## 1. Approved decisions

| # | Decision | Choice |
|---|---|---|
| 1 | **Scope** | Full Google Calendar integration: event created, Meet link auto-attached, candidate + interviewer invited as attendees. Not just a "generate URL" call — calendar event is the primary artifact. |
| 2 | **Auth model** | One shared Google account. A single `GoogleIntegration` document holds the connected account's tokens; all admins use it. Per-admin OAuth is a future extension. |
| 3 | **Failure / degradation** | Progressive enhancement with manual paste fallback. If Google isn't connected, or the API call fails, the schedule modal falls back to the existing "Paste meeting URL" field. Scheduling never blocks on Google. |
| 4 | **Lifecycle sync** | Full sync: schedule → create event, reschedule → patch event, cancel → delete event. Google emits native "updated" / "cancelled" notifications on each. |
| 5 | **Email behaviour** | Keep both: existing custom HR-branded emails fire as today, plus Google's native calendar invitations. Add a short note to the custom emails ("you'll also receive a Google Calendar invitation"). |
| 6 | **OAuth UX placement** | New "Settings" page in the admin nav, with an "Integrations" section containing the Google Calendar connect/disconnect controls. |

---

## 2. Architecture

### 2.1 New backend files

- **`src/models/GoogleIntegration.js`** — single-document collection. Fields: `accountEmail`, `accessToken`, `refreshToken`, `accessTokenExpiresAt`, `scope`, `connectedBy` (Admin reference), `createdAt`, `updatedAt`.
- **`src/repositories/googleIntegrationRepository.js`** — `findCurrent`, `upsert`, `clear`. Treats the collection as a singleton.
- **`src/services/googleAuthService.js`** — builds the OAuth consent URL, exchanges authorization codes for tokens, refreshes access tokens. Reads env-var credentials once on startup; if they're missing, all methods throw `E_GOOGLE_NOT_CONFIGURED`.
- **`src/services/googleCalendarService.js`** — thin wrapper around three Calendar API operations: `createEvent`, `patchEvent`, `deleteEvent`. Each method calls `getAccessToken()` (auto-refreshes if within 60s of expiry) before issuing the request. On `invalid_grant` error during refresh, marks the integration as broken and re-throws `E_GOOGLE_TOKEN_REVOKED`.
- **`src/controllers/integrationsController.js`** — HTTP handlers for the four endpoints in §2.4.
- **`src/routes/integrationsRoutes.js`** — admin-only router, mounted at `/integrations`.

### 2.2 Backend modifications

- **`src/models/Interview.js`**
  - `meetingUrl`: change from `required: true` to `required: false`. (May be null when an event is pending or scheduling failed.)
  - Add `googleCalendarEventId: { type: String, default: null }` — Google's event ID, used for later patch/delete calls.

- **`src/validators/interviewValidator.js`**
  - `scheduleSchema.body.meetingUrl`: change from `required()` to `.allow('', null).optional()`.

- **`src/services/interviewService.js`**
  - `schedule(...)`: if `meetingUrl` is empty/null and a Google integration exists, call `googleCalendarService.createEvent(...)`. Apply the returned `hangoutLink` to `meetingUrl` and `event.id` to `googleCalendarEventId`. If the call fails, return `ApiError.badRequest('Google Calendar unavailable — paste a meeting URL manually')` with code `E_CALENDAR_FAILED` so the frontend can switch the modal to manual mode.
  - `applyApprovedReschedule(...)`: after updating `scheduledAt` on the DB document, if `googleCalendarEventId` is present, call `googleCalendarService.patchEvent(eventId, { start, end })`. Failures are logged; reschedule still succeeds.
  - `cancel(...)`: after marking the interview cancelled, if `googleCalendarEventId` is present, call `googleCalendarService.deleteEvent(eventId)`. Failures logged; cancellation still succeeds.

- **`src/routes/index.js`** — mount `/integrations` router.

### 2.3 New frontend files

- **`src/api/integrationsApi.js`** — methods: `googleConnectUrl()` (returns the URL to redirect to), `googleStatus()` (returns `{ connected, accountEmail }`), `googleDisconnect()`.
- **`src/features/settings/SettingsPage.jsx`** + **`.scss`** — the new settings page. First section: "Integrations → Google Calendar".
- **`src/features/settings/settingsSlice.js`** — minimal slice holding `googleStatus`, `googleStatusLoading`.

### 2.4 Backend endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/admin/integrations/google/connect` | admin | Returns `{ url }` — the Google OAuth consent URL. Frontend redirects there. |
| `GET` | `/admin/integrations/google/callback` | none (OAuth redirect target) | Receives the `code` query param, exchanges it for tokens, upserts the `GoogleIntegration` doc, redirects to `<FRONTEND>/admin/settings?google=connected`. |
| `GET` | `/admin/integrations/google/status` | admin | Returns `{ connected: boolean, accountEmail?: string, connectedAt?: Date }`. |
| `POST` | `/admin/integrations/google/disconnect` | admin | Deletes the `GoogleIntegration` doc. Returns `{ disconnected: true }`. Past `googleCalendarEventId`s are kept on interviews so cancellation can still try (it'll just fail silently). |

### 2.5 Frontend modifications

- **`src/layouts/AdminLayout.jsx`** — add nav entry: `{ to: '/admin/settings', label: 'Settings', icon: '⚙' }`.
- **`src/routes/AppRoutes.jsx`** — register `/admin/settings` route inside the protected admin block.
- **`src/app/store.js`** — register `settings` reducer.
- **`src/features/interviews/ScheduleInterviewModal.jsx`** — see §3.1.

### 2.6 Dependencies

- Backend: `npm install googleapis` (official Google Node.js client; ~5 MB; pre-built OAuth + Calendar helpers).
- No new frontend dependencies.

---

## 3. Flows

### 3.1 Schedule flow

**Frontend (`ScheduleInterviewModal`):**

The modal has a new top section:

```
○ Auto-generate with Google Meet (recommended)
○ Paste meeting URL manually
```

- Default = "Auto-generate" if `googleStatus.connected` is true; otherwise default = "Manual paste" with a small hint "Google Calendar isn't connected — [connect →]".
- "Manual paste" reveals a URL input field (the current behaviour).
- "Auto-generate" hides the URL field entirely.
- On submit:
  - Manual: send `meetingUrl: '<pasted URL>'` to the backend (today's payload).
  - Auto: send `meetingUrl: ''` (or omit). Backend handles the Calendar call.
- If the backend response is `E_CALENDAR_FAILED`, the modal automatically switches to "Manual paste" mode, shows the error in a banner, and asks HR to paste a URL and resubmit.

**Backend (`interviewService.schedule`):**

```
1. Validate inputs (existing logic; meetingUrl now optional).
2. If req.body.meetingUrl is non-empty:
     interview.meetingUrl = req.body.meetingUrl
     // no Calendar call
3. Else:
     integration = GoogleIntegrationRepo.findCurrent()
     If !integration: throw E_GOOGLE_NOT_CONNECTED (412)
     event = googleCalendarService.createEvent({
       summary: `Interview: ${candidate.name} with ${interviewer.name}`,
       description: buildDescription(candidate, interviewer, notes),
       start: { dateTime: scheduledAt.toISOString() },
       end:   { dateTime: addMinutes(scheduledAt, durationMinutes).toISOString() },
       attendees: [{ email: candidate.email }, { email: interviewer.email }],
       conferenceData: { createRequest: { requestId: random(), conferenceSolutionKey: { type: 'hangoutsMeet' } } },
       reminders: { useDefault: true },
     })
     interview.meetingUrl = event.hangoutLink
     interview.googleCalendarEventId = event.id
4. Persist interview, fire existing scheduled-notification emails.
```

Google itself then sends native calendar invitations to candidate + interviewer (because `sendUpdates: 'all'` is the default).

### 3.2 Reschedule flow

When HR approves a reschedule (`interviewService.applyApprovedReschedule`):

```
1. interview.scheduledAt = approvedNewTime
2. interview.reminderSentAt = null   // existing logic
3. await interview.save()
4. If interview.googleCalendarEventId:
     try {
       googleCalendarService.patchEvent(interview.googleCalendarEventId, {
         start: { dateTime: approvedNewTime },
         end:   { dateTime: addMinutes(approvedNewTime, interview.durationMinutes) },
       })
     } catch (err) {
       logger.error('Calendar patch failed', { interviewId, err })
       // proceed — reschedule already persisted
     }
5. Fire existing reschedule emails.
```

### 3.3 Cancel flow

When HR cancels (`interviewService.cancel`):

```
1. interview.status = CANCELLED
2. interview.cancelledAt = now
3. interview.cancelReason = note
4. await interview.save()
5. If interview.googleCalendarEventId:
     try { googleCalendarService.deleteEvent(interview.googleCalendarEventId) }
     catch (err) { logger.error('Calendar delete failed', { interviewId, err }) }
6. Fire existing cancellation emails.
```

### 3.4 OAuth connect flow

```
1. HR clicks "Connect Google Calendar" on the Settings page.
2. Frontend GETs /admin/integrations/google/connect → receives { url }.
3. Frontend does window.location.href = url.
4. Google's consent screen → HR signs in + grants the calendar.events + email + profile scopes.
5. Google redirects to <BACKEND>/admin/integrations/google/callback?code=<auth code>.
6. Backend exchanges the code for { access_token, refresh_token, expires_in }.
7. Backend fetches the user's email via the userinfo endpoint.
8. Backend upserts the single GoogleIntegration document:
     { accountEmail, accessToken, refreshToken, accessTokenExpiresAt, scope, connectedBy: req.admin?.id ?? null }
9. Backend redirects HR to <FRONTEND>/admin/settings?google=connected.
10. Frontend SettingsPage notices the query param, shows a success toast, refreshes the status.
```

Note on auth at the callback endpoint: the callback comes from Google directly, not through the React app, so it can't have a JWT in the headers. We accept it un-authenticated but ALSO require the `state` parameter we set in step 2 — backend signs the state with `JWT_SECRET` at connect-time and verifies it at callback-time. Prevents CSRF.

### 3.5 Disconnect flow

```
1. HR clicks "Disconnect" on the Settings page (with a confirm dialog: "Existing interviews will keep their links, but new interviews can't auto-generate. Continue?").
2. Frontend POST /admin/integrations/google/disconnect.
3. Backend deletes the GoogleIntegration document.
4. Frontend updates the Settings UI; the schedule modal default flips back to manual paste.
```

### 3.6 Token refresh logic

Inside `googleCalendarService.getAccessToken()`:

```
1. integration = GoogleIntegrationRepo.findCurrent()
2. If !integration: throw E_GOOGLE_NOT_CONNECTED
3. If integration.accessTokenExpiresAt - 60s > now:
     return integration.accessToken
4. Else:
     try {
       newTokens = googleAuthService.refreshAccessToken(integration.refreshToken)
     } catch (err) {
       if (err.code === 'invalid_grant') {
         GoogleIntegrationRepo.clear()      // user revoked access in Google
         throw E_GOOGLE_TOKEN_REVOKED
       }
       throw err
     }
     GoogleIntegrationRepo.upsert({
       accessToken: newTokens.access_token,
       accessTokenExpiresAt: new Date(Date.now() + newTokens.expires_in * 1000),
       // refreshToken stays the same — Google only re-issues if rotated
     })
     return newTokens.access_token
```

---

## 4. Data model details

### 4.1 `GoogleIntegration` schema

```js
{
  accountEmail: { type: String, required: true },
  accessToken:  { type: String, required: true },
  refreshToken: { type: String, required: true },
  accessTokenExpiresAt: { type: Date, required: true },
  scope:        { type: String, default: '' },        // space-separated scopes granted
  connectedBy:  { type: ObjectId, ref: 'Admin', default: null },
  createdAt, updatedAt   // timestamps
}
```

Singleton enforcement: the repository's `upsert` uses `findOneAndUpdate({}, ..., { upsert: true })`. We never call `create` directly. There's at most ever one document in the collection.

### 4.2 `Interview` schema additions

```js
{
  // existing fields…
  meetingUrl: { type: String, required: false, default: null },  // changed from required:true
  googleCalendarEventId: { type: String, default: null },        // new
}
```

---

## 5. Error handling

| Error code | When | Frontend behaviour |
|---|---|---|
| `E_GOOGLE_NOT_CONFIGURED` | OAuth client ID/secret env vars are missing on server startup. Returned from `/connect` endpoint. | Settings page shows: "Google integration is not configured on this server. Contact your administrator." Connect button disabled. |
| `E_GOOGLE_NOT_CONNECTED` | Schedule called with no manual URL and no integration record. | Schedule modal switches to manual-paste mode with banner: "Google Calendar isn't connected. Paste a meeting URL manually, or [connect Google →]." |
| `E_GOOGLE_TOKEN_REVOKED` | Token refresh returns `invalid_grant`. Integration is cleared from DB. | Same banner as `E_GOOGLE_NOT_CONNECTED`. |
| `E_CALENDAR_FAILED` | Any other Calendar API failure (network, 5xx, quota). | Schedule modal switches to manual-paste with banner: "Couldn't auto-generate. Paste a meeting URL manually." |

All Calendar failures during **reschedule** or **cancel** are logged but never block the user's primary action — the DB always reflects the user's intent even if Google sync is broken.

---

## 6. Configuration

### 6.1 Environment variables (backend)

```
GOOGLE_OAUTH_CLIENT_ID=<from Google Cloud Console>
GOOGLE_OAUTH_CLIENT_SECRET=<from Google Cloud Console>
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:5000/api/admin/integrations/google/callback
```

In production, update `GOOGLE_OAUTH_REDIRECT_URI` to the production URL and add it to the OAuth client's authorized redirect URIs in Google Cloud Console.

### 6.2 Required Google Cloud setup (one-time)

1. Create GCP project.
2. Enable Google Calendar API.
3. Configure OAuth consent screen with scopes `auth/calendar.events`, `auth/userinfo.email`, `auth/userinfo.profile`.
4. Create OAuth 2.0 Web client credentials with the redirect URI above.

---

## 7. Out of scope

- **Per-admin OAuth.** Future migration: add `adminId` to the GoogleIntegration model, find by admin in `googleCalendarService`. Spec stays binary-compatible (current singleton becomes the default for migrations).
- **Two-way sync.** If someone edits or deletes the event directly in Google Calendar, our DB doesn't notice. Outbound only.
- **Service account / domain-wide delegation.** Requires paid Workspace; not justified for our scale.
- **Sync of attendee RSVPs back into our app.** If candidate declines in Gmail, we don't auto-cancel. HR sees the decline in their Google Calendar and acts manually.
- **Calendar event customisation UI.** Title, description, reminders are hardcoded templates. No "edit invitation copy" feature.
- **Multiple meeting-link providers.** Only Google Meet. No Zoom, no Teams, no Whereby.

---

## 8. Testing strategy

**Unit tests (backend):**
- `googleAuthService.test.js` — mocks the `googleapis` OAuth2 client. Asserts authorization URL contains the right scopes and signed state; asserts code exchange returns expected token shape; asserts refresh handles `invalid_grant`.
- `googleCalendarService.test.js` — mocks the Calendar API. Asserts createEvent passes the right payload, patchEvent updates only time fields, deleteEvent fires with the right event ID, expired-token path triggers a refresh.
- `interviewService.schedule.test.js` (extend existing) — three new tests: (a) manual URL passes through, (b) auto-mode calls calendar service and stores hangoutLink + eventId, (c) calendar-service failure throws `E_CALENDAR_FAILED`.
- Reschedule + cancel: extend existing tests to assert calendar service is invoked when `googleCalendarEventId` is present.

**Manual E2E:**
1. Run the OAuth flow end-to-end with a real Google account; verify the integration appears in Settings.
2. Schedule an interview in auto mode; verify the Calendar event + Meet link appear on the connected Google account's calendar; verify candidate + interviewer receive the native invite.
3. Approve a reschedule; verify the event's start/end times update on Google; verify the "updated time" notification email arrives.
4. Cancel the interview; verify the event disappears from Google Calendar; verify the "cancelled" notification arrives.
5. Disconnect Google, then schedule another interview; verify modal falls back to manual-paste mode.
6. Re-connect Google, but revoke access from the Google Account permissions page; trigger a schedule; verify the system handles `invalid_grant` cleanly and shows the manual-paste fallback.

---

## 9. Rollout

No data migration. Existing interviews keep their manually-pasted URLs and have `googleCalendarEventId: null`, so they're naturally skipped during reschedule/cancel.

Deploy order doesn't matter — frontend and backend can ship independently. Until both are live, the Settings page is hidden behind a feature flag (the nav entry).

---

## 10. Self-review notes

- ✅ All 6 brainstorm decisions are captured in §1 and reflected in §2-§3.
- ✅ Error states explicitly enumerated in §5; UI behaviour for each is specified.
- ✅ Single responsibility per file: `googleAuthService` handles tokens, `googleCalendarService` handles events, `integrationsController` handles HTTP — no overlap.
- ✅ Failure modes for reschedule/cancel chosen as "log and continue" — DB is the source of truth, Google sync is best-effort.
- ✅ Singleton pattern for `GoogleIntegration` is documented explicitly.
- ✅ Out-of-scope items in §7 cover the known follow-up questions (per-admin OAuth, two-way sync, multiple providers).
