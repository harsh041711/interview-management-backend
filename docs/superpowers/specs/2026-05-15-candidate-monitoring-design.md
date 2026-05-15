# Candidate-Side Monitoring for In-Interview Coding Task — Design Spec

**Status:** Approved
**Date:** 2026-05-15
**Audience:** engineers implementing this feature

---

## Goal

Mirror the standalone `CodingTestPage`'s anti-cheat behavior onto the in-interview coding task at `/coding-task/:token`, and surface tab-switch counts to the interviewer **live** inside the co-pilot's `CodingTasksPanel` so they can intervene during the call.

Two coupled changes:

1. **Candidate page** — `CodingTaskPage` blocks paste/copy/right-click and counts tab-switches; on every increment it PATCHes the count to the server.
2. **Interviewer panel** — `CodingTasksPanel` (already polls every 3-5s) renders the live tab-switch count per task, color-graded yellow at 3, red at 5.

---

## End-to-end Flow

```
1. Candidate opens /coding-task/:token
        ↓
   Page mounts → installs paste/copy/contextmenu blockers + visibilitychange listener
        ↓
2. Candidate switches tab
        ↓
   tabSwitches state +1 → localStorage('coding-task:{token}:tabSwitches', N)
        ↓
   PATCH /coding-task/:token/monitoring { tabSwitches: N }   ← fire-and-forget
        ↓
3. Interviewer's CodingTasksPanel polls status (existing 3-5s interval)
        ↓
   GET /interviews/:id/coding-tasks → status response now includes monitoring.tabSwitches
        ↓
   Badge re-renders: "Tab switches: N" (yellow ≥3, red ≥5)
4. Candidate clicks Submit
        ↓
   submit payload unchanged — monitoring already persisted server-side
```

---

## Architecture

### Backend (one schema field, one endpoint)

| Layer | New / Modified |
|---|---|
| `backend/src/models/LiveCodingTask.js` | Add `monitoring: { tabSwitches: { type: Number, default: 0, min: 0, max: 999 } }` on the root document |
| `backend/src/services/liveCodingTaskService.js` | Add `reportMonitoring(token, { tabSwitches })` — looks up task by token, sets `monitoring.tabSwitches` (idempotent set, NOT increment), clamps to 0–999 |
| `backend/src/controllers/liveCodingTaskController.js` | Add `reportMonitoring` handler |
| `backend/src/validators/liveCodingTaskValidator.js` | Add `reportMonitoringBody` Joi schema: `tabSwitches: Joi.number().integer().min(0).max(999).required()` |
| `backend/src/routes/liveCodingTaskPublicRoutes.js` | Add `PATCH /coding-task/:token/monitoring` (public, token-auth only — same auth model as Submit) |
| Existing status response on the interviewer side | Already returns the task. If the status controller serializes the full document, `monitoring` ships automatically once on the schema. If it picks fields explicitly, add `monitoring` to the projection. |

**Why idempotent set (not increment):**
- Client retries cause double-counting with `$inc`.
- Out-of-order delivery is safe with set (the latest count wins).
- Client already owns the truth (localStorage backup); server just persists it.

**Why `monitoring.tabSwitches` (not `submission.tabSwitches`):**
- Counts must surface BEFORE the candidate submits — that's the whole point of "live" monitoring.
- Keeps `submission` strictly about the submitted code.

**Service signature:**

```js
async function reportMonitoring(token, { tabSwitches }) {
  const clamped = Math.max(0, Math.min(999, Math.floor(Number(tabSwitches) || 0)));
  const task = await LiveCodingTask.findOneAndUpdate(
    { token },
    { $set: { 'monitoring.tabSwitches': clamped } },
    { new: true },
  );
  if (!task) throw ApiError.notFound('Coding task not found', { code: 'E_TASK_NOT_FOUND' });
  return { tabSwitches: task.monitoring.tabSwitches };
}
```

**Route:**

```js
router.patch(
  '/:token/monitoring',
  validate(v.reportMonitoringBody),
  ctrl.reportMonitoring,
);
```

No rate limiter — a candidate switching tabs even 50 times in 30 minutes is well below any reasonable abuse threshold, and the endpoint is idempotent. Token-based auth (already enforced by route mounting) is sufficient.

### Frontend

| Layer | New / Modified |
|---|---|
| `frontend/src/api/liveCodingTaskApi.js` | Add `reportMonitoring(token, { tabSwitches })` — PATCH the route above |
| `frontend/src/features/codingTask/CodingTaskPage.jsx` | Add `tabSwitches` state (seeded from localStorage); `visibilitychange` listener that bumps + PATCHes; `paste`/`copy`/`contextmenu` blockers; `Ctrl/Cmd+V`/`Ctrl/Cmd+C` keydown blockers; hint line `"🚫 Pasting disabled · Tab switches tracked"`; counter pill in header (gray default, yellow ≥3, red ≥5) |
| `frontend/src/features/codingTask/CodingTaskPage.scss` | Counter pill styles + threshold colors (yellow `#fef3c7/#92400e`, red `#fee2e2/#991b1b`) — mirror CodingTestPage's existing classes |
| `frontend/src/features/liveInterview/CodingTasksPanel.jsx` | For each task in the list, render `"Tab switches: N"` badge next to status, same color thresholds. Hide badge if `monitoring?.tabSwitches` is undefined or 0 |

**`CodingTaskPage` event handling:**

```js
// Mount
useEffect(() => {
  const stored = Number(localStorage.getItem(`coding-task:${token}:tabSwitches`) || 0);
  if (stored > 0) setTabSwitches(stored);

  const onVis = () => {
    if (!document.hidden) return;
    // Read latest from localStorage (source of truth between renders) and
    // bump — avoids stale-closure problems and StrictMode double-invocation
    // side-effects inside a state-updater function.
    const cur = Number(localStorage.getItem(`coding-task:${token}:tabSwitches`)) || 0;
    const next = cur + 1;
    localStorage.setItem(`coding-task:${token}:tabSwitches`, String(next));
    setTabSwitches(next);
    liveCodingTaskApi.reportMonitoring(token, { tabSwitches: next }).catch(() => {});
  };
  document.addEventListener('visibilitychange', onVis);

  const block = (e) => { e.preventDefault(); };
  const blockKey = (e) => {
    const k = (e.key || '').toLowerCase();
    if ((e.ctrlKey || e.metaKey) && (k === 'v' || k === 'c')) e.preventDefault();
  };
  document.addEventListener('paste', block);
  document.addEventListener('copy', block);
  document.addEventListener('contextmenu', block);
  document.addEventListener('keydown', blockKey);

  return () => {
    document.removeEventListener('visibilitychange', onVis);
    document.removeEventListener('paste', block);
    document.removeEventListener('copy', block);
    document.removeEventListener('contextmenu', block);
    document.removeEventListener('keydown', blockKey);
  };
}, [token]);
```

**Counter pill — same threshold logic as CodingTestPage:**

```jsx
const pillClass =
  tabSwitches >= 5 ? 'ct-pill ct-pill--danger'
  : tabSwitches >= 3 ? 'ct-pill ct-pill--warn'
  : 'ct-pill';

<span className={pillClass}>Tab switches: {tabSwitches}</span>
```

**`CodingTasksPanel` badge:**

```jsx
{task.monitoring?.tabSwitches > 0 && (
  <span className={
    task.monitoring.tabSwitches >= 5 ? 'ct-tag ct-tag--danger'
    : task.monitoring.tabSwitches >= 3 ? 'ct-tag ct-tag--warn'
    : 'ct-tag'
  }>
    Tab switches: {task.monitoring.tabSwitches}
  </span>
)}
```

---

## Behavior Details

- **Silent block** for paste/copy/right-click — no toast spam, no popup.
- **No auto-end** on tab switches — pure observation. The interviewer decides if/when to confront.
- **Fire-and-forget** PATCH — failure logged via `.catch(() => {})` but never blocks the candidate's coding flow.
- **localStorage backup** — count survives a refresh; on next mount, state is seeded from localStorage (server already has it from the prior PATCH, so no re-sync needed).
- **Submit payload unchanged** — monitoring is already on the server.
- **The interviewer-side polling cadence stays the same** — no new polling code needed.

---

## Privacy

- No keystroke logging, no screen recording, no clipboard content capture.
- Only a per-task counter and three event blockers — entirely candidate-visible (the hint text says so).
- Counter resets to 0 if the task is deleted/regenerated (new token, new document).

---

## Tests

### Backend — Jest

Add to `backend/tests/unit/liveCodingTaskService.test.js` (or new file if none exists):

- **Happy path:** valid token + `{ tabSwitches: 5 }` → service returns `{ tabSwitches: 5 }`, document is updated.
- **Idempotent:** calling twice with `{ tabSwitches: 7 }` → final value is 7, not 14.
- **Clamps high:** `{ tabSwitches: 5000 }` → clamps to 999.
- **Clamps negative:** `{ tabSwitches: -3 }` → clamps to 0.
- **Token not found:** unknown token → throws `ApiError.notFound` with code `E_TASK_NOT_FOUND`.

Validator-level checks (`tabSwitches` required, integer, in range) are covered by the existing Joi `validate` middleware tests — no new integration test needed.

### Frontend — Manual

1. Interviewer opens co-pilot, sends a coding task. CodingTasksPanel shows the new task.
2. Candidate opens `/coding-task/:token`. Hint line "🚫 Pasting disabled · Tab switches tracked" visible. Counter shows `0`.
3. Candidate switches to another tab and back → counter shows `1`. Within ~5s, interviewer panel shows `Tab switches: 1`.
4. Repeat 2 more times → counter `3`, both candidate pill and interviewer badge turn yellow.
5. Repeat 2 more times → counter `5`, both turn red.
6. Candidate tries to right-click → context menu is blocked. Tries `Ctrl+V` in the editor → nothing pastes. Tries `Ctrl+C` on selected text → nothing copies.
7. Refresh the candidate page → counter is still `5` (from localStorage), interviewer badge still red.
8. Candidate clicks Submit → submission succeeds; monitoring count remains `5` on both sides.

---

## Out of Scope (YAGNI)

- Counting paste attempts (TL asked for blocking, not counting).
- Fullscreen-exit detection, dev-tools detection, window blur.
- Auto-flagging the task as "suspicious" or auto-ending on threshold.
- Push/socket updates — existing 3-5s poll on the panel is fine for a 20-30 min task.
- Surfacing monitoring data into the post-interview review report (Phase-later).
- Recording the timestamp of each tab-switch event (only the running count matters here).
- Mirroring monitoring onto the read-only "View interview notes" modal (post-end).

---

## Future Enhancements (not in this plan)

- Per-event timestamps + a small audit trail in the task document.
- Mirror to the standalone `CodingTestPage` to also send monitoring real-time (currently it only sends at submit).
- Add monitoring snapshot to the candidate review summary on `CandidateDetailPage`.
- Configurable thresholds per task / per role.
