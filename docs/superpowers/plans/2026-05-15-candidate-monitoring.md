# Candidate-Side Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tab-switch counting + paste/copy/right-click blocking to the in-interview coding task candidate page, and surface the live count in the interviewer's CodingTasksPanel.

**Architecture:** Add `monitoring.tabSwitches` to the `LiveCodingTask` schema and a `PATCH /coding-tasks/:token/monitoring` endpoint that idempotently sets the count. The candidate page increments locally on `visibilitychange`, persists to localStorage, and fires the PATCH. The interviewer's CodingTasksPanel already polls the task list every 5s — the new field rides on the existing response and renders as a badge.

**Tech Stack:** Mongoose, Express, Joi, Jest (backend); React + Redux Toolkit, Monaco editor, axios (frontend); existing 5s poll on `CodingTasksPanel`.

**Spec:** [docs/superpowers/specs/2026-05-15-candidate-monitoring-design.md](docs/superpowers/specs/2026-05-15-candidate-monitoring-design.md)

---

### Task 1: Add `monitoring.tabSwitches` to LiveCodingTask schema

**Files:**
- Modify: `backend/src/models/LiveCodingTask.js`

- [ ] **Step 1: Add the monitoring sub-schema field**

Open `backend/src/models/LiveCodingTask.js` and edit the `taskSchema` definition (the big `new mongoose.Schema({...})` block starting at line 55). Add a `monitoring` field directly after `submittedAt` (around line 74), before the closing `})` of the schema object.

The new field:

```js
    monitoring: {
      tabSwitches: { type: Number, default: 0, min: 0, max: 999 },
    },
```

The relevant region of the file should look like this after editing:

```js
    openedAt:    { type: Date, default: null },
    submittedAt: { type: Date, default: null },

    monitoring: {
      tabSwitches: { type: Number, default: 0, min: 0, max: 999 },
    },
  },
  {
    timestamps: true,
```

- [ ] **Step 2: Verify backend boots with no schema errors**

Run from `backend/`:

```
node -e "require('./src/models/LiveCodingTask'); console.log('OK');"
```

Expected: prints `OK` (no Mongoose schema warnings).

- [ ] **Step 3: Commit**

```bash
git add backend/src/models/LiveCodingTask.js
git commit -m "feat(live-coding-task): add monitoring.tabSwitches field to schema"
```

---

### Task 2: Add `reportMonitoring` service with tests (TDD)

**Files:**
- Test (modify): `backend/tests/unit/liveCodingTaskService.test.js`
- Modify: `backend/src/services/liveCodingTaskService.js`

- [ ] **Step 1: Write 5 failing tests**

Open `backend/tests/unit/liveCodingTaskService.test.js`. Append the following `describe` block at the bottom of the file, after the last existing `describe(...)` block but before the final EOF:

```js
describe('liveCodingTaskService.reportMonitoring', () => {
  const TOKEN = 'tok-abc';

  beforeEach(() => {
    taskRepo.findByToken = jest.fn();
    taskRepo.updateById = jest.fn();
  });

  test('happy path: persists tabSwitches and returns the value', async () => {
    taskRepo.findByToken.mockResolvedValue({ _id: 't1', id: 't1', status: 'opened' });
    taskRepo.updateById.mockResolvedValue({ _id: 't1', monitoring: { tabSwitches: 5 } });

    const out = await svc.reportMonitoring({ token: TOKEN, tabSwitches: 5 });

    expect(taskRepo.updateById).toHaveBeenCalledWith('t1', { 'monitoring.tabSwitches': 5 });
    expect(out).toEqual({ tabSwitches: 5 });
  });

  test('idempotent: calling with the same value twice yields the same value', async () => {
    taskRepo.findByToken.mockResolvedValue({ _id: 't1', id: 't1', status: 'opened' });
    taskRepo.updateById.mockResolvedValue({ _id: 't1', monitoring: { tabSwitches: 7 } });

    await svc.reportMonitoring({ token: TOKEN, tabSwitches: 7 });
    const out2 = await svc.reportMonitoring({ token: TOKEN, tabSwitches: 7 });

    expect(out2).toEqual({ tabSwitches: 7 });
    expect(taskRepo.updateById).toHaveBeenLastCalledWith('t1', { 'monitoring.tabSwitches': 7 });
  });

  test('clamps values above 999 down to 999', async () => {
    taskRepo.findByToken.mockResolvedValue({ _id: 't1', id: 't1', status: 'opened' });
    taskRepo.updateById.mockResolvedValue({ _id: 't1', monitoring: { tabSwitches: 999 } });

    const out = await svc.reportMonitoring({ token: TOKEN, tabSwitches: 5000 });

    expect(taskRepo.updateById).toHaveBeenCalledWith('t1', { 'monitoring.tabSwitches': 999 });
    expect(out).toEqual({ tabSwitches: 999 });
  });

  test('clamps negative values to 0', async () => {
    taskRepo.findByToken.mockResolvedValue({ _id: 't1', id: 't1', status: 'opened' });
    taskRepo.updateById.mockResolvedValue({ _id: 't1', monitoring: { tabSwitches: 0 } });

    const out = await svc.reportMonitoring({ token: TOKEN, tabSwitches: -3 });

    expect(taskRepo.updateById).toHaveBeenCalledWith('t1', { 'monitoring.tabSwitches': 0 });
    expect(out).toEqual({ tabSwitches: 0 });
  });

  test('throws notFound when token does not match a task', async () => {
    taskRepo.findByToken.mockResolvedValue(null);

    await expect(svc.reportMonitoring({ token: 'bad', tabSwitches: 1 }))
      .rejects.toMatchObject({ statusCode: 404, code: 'E_TASK_NOT_FOUND' });
    expect(taskRepo.updateById).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they all fail**

Run from `backend/`:

```
npx jest tests/unit/liveCodingTaskService.test.js -t "reportMonitoring" --no-coverage
```

Expected: 5 tests FAIL with "svc.reportMonitoring is not a function" or similar.

- [ ] **Step 3: Implement `reportMonitoring` in the service**

Open `backend/src/services/liveCodingTaskService.js`. Add the new function just before the `module.exports = ...` line at the bottom:

```js
const reportMonitoring = async ({ token, tabSwitches }) => {
  const t = await taskRepo.findByToken(token);
  if (!t) throw ApiError.notFound('Coding task not found', { code: 'E_TASK_NOT_FOUND' });
  const clamped = Math.max(0, Math.min(999, Math.floor(Number(tabSwitches) || 0)));
  await taskRepo.updateById(t._id || t.id, { 'monitoring.tabSwitches': clamped });
  return { tabSwitches: clamped };
};
```

Then update the `module.exports` line at the bottom to include `reportMonitoring`:

```js
module.exports = { create, getPublic, runPublic, submitPublic, listForInterview, cancel, reportMonitoring };
```

- [ ] **Step 4: Run tests to verify they pass**

```
npx jest tests/unit/liveCodingTaskService.test.js -t "reportMonitoring" --no-coverage
```

Expected: 5 tests PASS.

- [ ] **Step 5: Run the full backend suite to confirm no regressions**

```
npx jest --no-coverage
```

Expected: all suites pass (was 196/196 before; should now be 201/201).

- [ ] **Step 6: Commit**

```bash
git add backend/tests/unit/liveCodingTaskService.test.js backend/src/services/liveCodingTaskService.js
git commit -m "feat(live-coding-task): add reportMonitoring service + 5 unit tests"
```

---

### Task 3: Add validator + controller handler + public route

**Files:**
- Modify: `backend/src/validators/liveCodingTaskValidator.js`
- Modify: `backend/src/controllers/liveCodingTaskController.js`
- Modify: `backend/src/routes/liveCodingTaskPublicRoutes.js`

- [ ] **Step 1: Add the Joi schema**

Open `backend/src/validators/liveCodingTaskValidator.js`. After the existing `submitSchema` line (around line 34), add:

```js
const reportMonitoringSchema = {
  params: Joi.object({ token: Joi.string().min(8).max(128).required() }),
  body:   Joi.object({
    tabSwitches: Joi.number().integer().min(0).max(999).required(),
  }),
};
```

Then update the `module.exports = {...}` block at the bottom of the file to include the new schema:

```js
module.exports = {
  interviewIdParam,
  createSchema,
  cancelParamsSchema,
  tokenParamSchema,
  runSchema,
  submitSchema,
  reportMonitoringSchema,
};
```

- [ ] **Step 2: Add the controller handler**

Open `backend/src/controllers/liveCodingTaskController.js`. After the existing `submit` handler (around line 39), add:

```js
const reportMonitoring = asyncHandler(async (req, res) => {
  const out = await svc.reportMonitoring({
    token: req.params.token,
    tabSwitches: req.body.tabSwitches,
  });
  return ok(res, out, 'OK');
});
```

Then update the `module.exports` line at the bottom to include `reportMonitoring`:

```js
module.exports = { create, list, cancel, getPublic, run, submit, reportMonitoring };
```

- [ ] **Step 3: Wire the public route**

Open `backend/src/routes/liveCodingTaskPublicRoutes.js`. Add a new line after the existing `submit` route (around line 12), so the file looks like this:

```js
router.get('/:token',         validate(v.tokenParamSchema), ctrl.getPublic);
router.post('/:token/run',    codingRunLimiter, validate(v.runSchema), ctrl.run);
router.post('/:token/submit', validate(v.submitSchema), ctrl.submit);
router.patch('/:token/monitoring', validate(v.reportMonitoringSchema), ctrl.reportMonitoring);
```

- [ ] **Step 4: Verify the backend boots cleanly**

Run from `backend/`:

```
node -e "require('./src/routes/liveCodingTaskPublicRoutes'); console.log('OK');"
```

Expected: prints `OK`.

- [ ] **Step 5: Run the full suite again to confirm no breakage**

```
npx jest --no-coverage
```

Expected: all tests still pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/validators/liveCodingTaskValidator.js backend/src/controllers/liveCodingTaskController.js backend/src/routes/liveCodingTaskPublicRoutes.js
git commit -m "feat(live-coding-task): wire PATCH /coding-tasks/:token/monitoring"
```

---

### Task 4: Frontend API client method

**Files:**
- Modify: `frontend/src/api/liveCodingTaskApi.js`

- [ ] **Step 1: Add `reportMonitoring` to the public-side block**

Open `frontend/src/api/liveCodingTaskApi.js`. After the existing `submit` method (around line 24), add a comma and a new method, so the file ends like this:

```js
  submit: (token, code) =>
    apiClient.post(`/coding-tasks/${token}/submit`, { code }).then((r) => r.data.data),
  reportMonitoring: (token, { tabSwitches }) =>
    apiClient.patch(`/coding-tasks/${token}/monitoring`, { tabSwitches }).then((r) => r.data.data),
};
```

- [ ] **Step 2: Verify frontend type-checks / builds**

Run from `frontend/`:

```
npm run lint -- src/api/liveCodingTaskApi.js
```

Expected: no lint errors. (If the project has no per-file lint, run `npm run build` and confirm it completes.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/liveCodingTaskApi.js
git commit -m "feat(live-coding-task): add reportMonitoring API client method"
```

---

### Task 5: Add monitoring effects to CodingTaskPage

**Files:**
- Modify: `frontend/src/features/codingTask/CodingTaskPage.jsx`

- [ ] **Step 1: Add a tab-switch helper above the component**

Open `frontend/src/features/codingTask/CodingTaskPage.jsx`. Just below the existing `normalizeStarter` function (around line 29, before `export default function CodingTaskPage()`), add:

```js
const tabSwKey = (token) => `coding-task:${token}:tabSwitches`;

const readStoredTabSwitches = (token) => {
  try {
    const n = parseInt(localStorage.getItem(tabSwKey(token)) || '0', 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch { return 0; }
};
```

- [ ] **Step 2: Add `tabSwitches` state inside the component**

Open the same file. Inside `CodingTaskPage`, just after the `const [submitted, setSubmitted] = useState(null);` line (around line 43), add:

```js
  const [tabSwitches, setTabSwitches] = useState(() => readStoredTabSwitches(token));
```

- [ ] **Step 3: Add the `visibilitychange` + paste-blocker effect**

Open the same file. Below the existing `useEffect` that loads the task (the one that ends with `return () => { cancelled = true; };` around line 61), add this new effect block:

```js
  // Anti-cheat monitoring: count tab switches (PATCH to server on each bump)
  // and block paste/copy/right-click while the candidate has this page open.
  useEffect(() => {
    if (!token) return undefined;

    const onVis = () => {
      if (!document.hidden) return;
      const cur = Number(localStorage.getItem(tabSwKey(token))) || 0;
      const next = cur + 1;
      try { localStorage.setItem(tabSwKey(token), String(next)); } catch { /* ignore */ }
      setTabSwitches(next);
      liveCodingTaskApi.reportMonitoring(token, { tabSwitches: next }).catch(() => {});
    };

    const block = (e) => { e.preventDefault(); };
    const blockKey = (e) => {
      const k = (e.key || '').toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (k === 'v' || k === 'c')) e.preventDefault();
    };

    document.addEventListener('visibilitychange', onVis);
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

- [ ] **Step 4: Render the counter pill in the page header**

Open the same file. Find the `coding-task__head` block (around line 120-128). Replace the existing block:

```jsx
      <div className="coding-task__head">
        <div>
          <div className="coding-task__title">Interview coding task</div>
          <div className="coding-task__subtitle">Write your solution and click Submit when ready.</div>
        </div>
        <span className={`coding-task__difficulty coding-task__difficulty--${task.problem.difficulty}`}>
          {task.problem.difficulty}
        </span>
      </div>
```

with this version that adds the counter pill (and the "Pasting disabled · Tab switches tracked" hint stays on the editor hint bar — that's edited in Step 5):

```jsx
      <div className="coding-task__head">
        <div>
          <div className="coding-task__title">Interview coding task</div>
          <div className="coding-task__subtitle">Write your solution and click Submit when ready.</div>
        </div>
        <div className="coding-task__head-right">
          <span className={`coding-task__tabsw ${
            tabSwitches >= 5 ? 'coding-task__tabsw--danger'
            : tabSwitches >= 3 ? 'coding-task__tabsw--warn'
            : ''
          }`}>
            👁 Tab switches: {tabSwitches}
          </span>
          <span className={`coding-task__difficulty coding-task__difficulty--${task.problem.difficulty}`}>
            {task.problem.difficulty}
          </span>
        </div>
      </div>
```

- [ ] **Step 5: Update the editor-bar hint to mention monitoring**

In the same file, find the `coding-task__editor-bar` block (around line 219) — specifically the line:

```jsx
            <span className="coding-task__editor-hint">Live interview · your interviewer will review your submission</span>
```

Replace with:

```jsx
            <span className="coding-task__editor-hint">Pasting disabled · Tab switches tracked · Your interviewer will review your submission</span>
```

- [ ] **Step 6: Disable Monaco's own context menu**

In the same file, in the `<Editor ... options={...}>` block (around line 229-236), add `contextmenu: false,` to the options object. After editing, the options block should look like:

```jsx
              options={{
                minimap: { enabled: false },
                contextmenu: false,
                fontSize: 14,
                automaticLayout: true,
                scrollBeyondLastLine: false,
                tabSize: 2,
                padding: { top: 12 },
              }}
```

- [ ] **Step 7: Verify frontend builds**

Run from `frontend/`:

```
npm run build
```

Expected: build succeeds.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/codingTask/CodingTaskPage.jsx
git commit -m "feat(coding-task): tab-switch counter + paste/copy/right-click blocking on candidate page"
```

---

### Task 6: CodingTaskPage SCSS — counter pill + head-right layout

**Files:**
- Modify: `frontend/src/features/codingTask/CodingTaskPage.scss`

- [ ] **Step 1: Append the new styles**

Open `frontend/src/features/codingTask/CodingTaskPage.scss`. Append these blocks at the END of the file (after the last `}`):

```scss
.coding-task {
  &__head-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  &__tabsw {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 9999px;
    background: #f1f5f9;
    color: #475569;
    font-size: 12px;
    font-weight: 600;

    &--warn {
      background: #fef3c7;
      color: #92400e;
    }

    &--danger {
      background: #fee2e2;
      color: #991b1b;
    }
  }
}
```

- [ ] **Step 2: Verify build**

Run from `frontend/`:

```
npm run build
```

Expected: build succeeds, no SCSS errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/codingTask/CodingTaskPage.scss
git commit -m "feat(coding-task): styles for tab-switch counter pill"
```

---

### Task 7: Show tab-switch badge in CodingTasksPanel

**Files:**
- Modify: `frontend/src/features/liveInterview/CodingTasksPanel.jsx`
- Modify: `frontend/src/features/liveInterview/CodingTasksPanel.scss`

- [ ] **Step 1: Render the badge in the task meta row**

Open `frontend/src/features/liveInterview/CodingTasksPanel.jsx`. Find the `coding-tasks__meta` block inside `TaskRow` (around line 48-56). Replace it with this version that adds the monitoring badge as a sibling pill:

```jsx
      <div className="coding-tasks__meta">
        <span className="coding-tasks__pill">{task.problem?.difficulty}</span>
        <span className="coding-tasks__pill coding-tasks__pill--lang">{task.problem?.language}</span>
        {(task.monitoring?.tabSwitches || 0) > 0 && (
          <span className={`coding-tasks__pill coding-tasks__pill--monitor ${
            task.monitoring.tabSwitches >= 5 ? 'coding-tasks__pill--danger'
            : task.monitoring.tabSwitches >= 3 ? 'coding-tasks__pill--warn'
            : ''
          }`}>
            👁 Tab switches: {task.monitoring.tabSwitches}
          </span>
        )}
        {task.submittedAt && (
          <span className="coding-tasks__time">
            Submitted {new Date(task.submittedAt).toLocaleTimeString()}
          </span>
        )}
      </div>
```

- [ ] **Step 2: Add the badge styles**

Open `frontend/src/features/liveInterview/CodingTasksPanel.scss`. Append at the end of the file:

```scss
.coding-tasks {
  &__pill {
    &--monitor {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: #f1f5f9;
      color: #475569;
    }
    &--warn {
      background: #fef3c7;
      color: #92400e;
    }
    &--danger {
      background: #fee2e2;
      color: #991b1b;
    }
  }
}
```

- [ ] **Step 3: Verify build**

Run from `frontend/`:

```
npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/liveInterview/CodingTasksPanel.jsx frontend/src/features/liveInterview/CodingTasksPanel.scss
git commit -m "feat(coding-tasks-panel): show live tab-switch count per task"
```

---

### Task 8: Manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Start the dev servers**

Open two terminals:

```
cd backend && npm run dev
```

```
cd frontend && npm run dev
```

Wait for both to be ready (backend listening on its port; frontend bundling complete).

- [ ] **Step 2: Send a coding task as the interviewer**

In a browser, log in as an interviewer, open a scheduled interview's co-pilot, click "Send coding task", pick a difficulty + language, send. Verify the task appears in `CodingTasksPanel` with status "Sent · waiting". Copy the candidate link.

- [ ] **Step 3: Open the candidate page in a separate browser profile / incognito**

Paste the link in incognito. Verify:
- The header shows the counter pill `👁 Tab switches: 0` (default gray).
- The editor-bar hint reads "Pasting disabled · Tab switches tracked · Your interviewer will review your submission".
- The status in the interviewer's panel switches to "Candidate viewing" within ~5s.

- [ ] **Step 4: Test paste/copy/right-click blocking**

On the candidate page:
- Try `Ctrl+V` (or `Cmd+V`) in the Monaco editor — nothing pastes.
- Try `Ctrl+C` on selected code — clipboard does not get the text.
- Try right-click anywhere on the page — context menu does not appear.

- [ ] **Step 5: Trigger 3 tab switches and confirm yellow threshold**

On the candidate page, switch to another tab and back, 3 times. Verify:
- The counter pill updates to `👁 Tab switches: 3` and turns yellow.
- Within ~5s, the interviewer's panel shows the same `👁 Tab switches: 3` pill in yellow.

- [ ] **Step 6: Trigger 2 more switches and confirm red threshold**

Switch tabs 2 more times so the count hits 5. Verify both pills (candidate + interviewer) turn red.

- [ ] **Step 7: Refresh the candidate page**

Hit refresh on the candidate page. Verify:
- The counter pill is still `5` (loaded from localStorage).
- The interviewer's pill is still `5` (loaded from server).

- [ ] **Step 8: Submit and confirm count persists**

On the candidate page, click Submit. Verify the success screen appears. On the interviewer's panel, confirm the task status flips to "Submitted" and the tab-switch badge is still `5` in red.

- [ ] **Step 9: Final commit (if there were any tweaks during verification)**

If verification surfaced no issues, skip this step. Otherwise, fix the issue, run the relevant tests/build, and commit with a `fix(...)` message.

---

## Self-Review Notes

**Spec coverage:**
- Schema field `monitoring.tabSwitches` → Task 1 ✅
- Service `reportMonitoring` with 5 tests (happy / idempotent / clamp high / clamp negative / not-found) → Task 2 ✅
- Validator `reportMonitoringSchema` → Task 3 ✅
- Controller handler → Task 3 ✅
- Public route `PATCH /coding-tasks/:token/monitoring` → Task 3 ✅
- Frontend API method → Task 4 ✅
- Candidate page: counter, paste/copy/right-click blockers, visibilitychange listener, PATCH on bump → Task 5 ✅
- Candidate page: hint text "Pasting disabled · Tab switches tracked" → Task 5 ✅
- Candidate page styles (yellow ≥3, red ≥5) → Task 6 ✅
- Interviewer panel badge with same thresholds → Task 7 ✅
- Manual verification matching the spec's 8-step manual test → Task 8 ✅

**Type/name consistency:**
- Service function name `reportMonitoring` consistent across service, controller, exports, test file.
- Field path `monitoring.tabSwitches` consistent in schema, service update payload, service return value, frontend reads (`task.monitoring?.tabSwitches`).
- LocalStorage key `coding-task:{token}:tabSwitches` consistent across page helper and effect.
- Thresholds 3/5 consistent across candidate page pill, panel badge, and spec.

**Out of scope (per spec):** paste-attempt counts, fullscreen/devtools detection, auto-end on threshold, socket push, post-interview review surfacing.
