# Candidate Timeline + Schedule Next Round Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the conditional single-review block on `CandidateDetailPage` with a horizontal multi-round timeline (interview-per-node, click-to-expand reviews inline) and a trailing "+ Schedule next round" affordance pre-filled with the candidate and next round type.

**Architecture:** Extend `candidateService.detail` to include `interviews[]`, `reviews[]`, and per-interview `copilotQuestions[]` in one payload — no new endpoints. Build a `CandidateTimeline` component in `frontend/src/features/candidates/` that renders nodes, the inline expand row, and the synthetic "Schedule next" node. Extend the existing `ScheduleInterviewModal` to accept a pre-fill payload that locks the candidate and seeds the round-type defaults.

**Tech Stack:** Express + Mongoose (backend); Jest (unit tests); React + Redux Toolkit, SCSS (frontend). All data flows through the existing `candidateApi.detail` + `fetchCandidate` thunk.

**Spec:** [docs/superpowers/specs/2026-05-15-candidate-timeline-design.md](docs/superpowers/specs/2026-05-15-candidate-timeline-design.md)

---

## File Map

| File | Role |
|---|---|
| `backend/src/services/candidateService.js` | Extend `detail()` to compose interviews + reviews + copilot questions |
| `backend/tests/unit/candidateService.test.js` | New tests for the extended detail response |
| `frontend/src/features/candidates/CandidateTimeline.jsx` | NEW — the stepper component (nodes + inline expand) |
| `frontend/src/features/candidates/CandidateTimeline.scss` | NEW — styles for the stepper |
| `frontend/src/features/candidates/CandidateDetailPage.jsx` | Render the new timeline; wire schedule-next modal; remove the `ReviewPanel` block |
| `frontend/src/features/candidates/candidateSlice.js` | Persist `interviews` + `reviews` from the detail response |
| `frontend/src/features/interviews/ScheduleInterviewModal.jsx` | Accept a `prefill` prop for create-with-locked-candidate mode |

---

### Task 1: Backend — extend `candidateService.detail` (TDD)

**Files:**
- Test (modify): `backend/tests/unit/candidateService.test.js`
- Modify: `backend/src/services/candidateService.js`

- [ ] **Step 1: Read the existing test file to see the mock pattern**

Run: `head -80 backend/tests/unit/candidateService.test.js`
Note the existing mock pattern for `candidateRepository`, `submissionRepository`, and how `detail` tests are set up. Reuse that pattern.

- [ ] **Step 2: Write failing tests for the new fields**

Append to the bottom of `backend/tests/unit/candidateService.test.js`:

```js
describe('candidateService.detail — multi-round timeline payload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    candidateRepository.findById = jest.fn();
    submissionRepository.findByCandidate = jest.fn().mockResolvedValue(null);
    interviewRepository.list = jest.fn();
    reviewRepository.findAllByCandidate = jest.fn();
    liveSessionRepository.findLatestByInterview = jest.fn();
  });

  test('returns interviews sorted by round asc with stripped fields', async () => {
    const candidate = {
      id: 'c1', _id: 'c1', name: 'Jane Doe', email: 'j@e.com',
      techStack: ['react'], experience: 'mid', status: 'awaiting_decision',
    };
    candidateRepository.findById.mockResolvedValue(candidate);

    const ivR2 = {
      _id: 'iv2', id: 'iv2', round: 2, roundType: 'practical', status: 'scheduled',
      scheduledAt: new Date('2026-05-16T10:00:00Z'), completedAt: null, durationMinutes: 45,
      interviewer: { _id: 'i2', id: 'i2', name: 'Sarah L.' }, notes: null,
    };
    const ivR1 = {
      _id: 'iv1', id: 'iv1', round: 1, roundType: 'technical', status: 'completed',
      scheduledAt: new Date('2026-05-12T10:00:00Z'),
      completedAt: new Date('2026-05-12T10:45:00Z'), durationMinutes: 45,
      interviewer: { _id: 'i1', id: 'i1', name: 'John D.' }, notes: 'kickoff',
    };
    interviewRepository.list.mockResolvedValue({ items: [ivR2, ivR1] });
    reviewRepository.findAllByCandidate.mockResolvedValue([]);
    liveSessionRepository.findLatestByInterview.mockResolvedValue(null);

    const out = await svc.detail('c1');

    expect(out.interviews).toHaveLength(2);
    expect(out.interviews[0].round).toBe(1);
    expect(out.interviews[1].round).toBe(2);
    expect(out.interviews[0].interviewer).toEqual({ id: 'i1', name: 'John D.' });
    expect(out.interviews[0].copilotQuestions).toEqual([]);
  });

  test('includes copilot questions per interview when a session exists', async () => {
    candidateRepository.findById.mockResolvedValue({ id: 'c1', _id: 'c1', name: 'X', email: 'x@e.com' });
    interviewRepository.list.mockResolvedValue({ items: [
      { _id: 'iv1', id: 'iv1', round: 1, roundType: 'technical', status: 'completed',
        scheduledAt: new Date(), durationMinutes: 45,
        interviewer: { _id: 'i1', id: 'i1', name: 'John' } },
    ] });
    reviewRepository.findAllByCandidate.mockResolvedValue([]);
    liveSessionRepository.findLatestByInterview.mockResolvedValue({
      questions: [
        { text: 'Explain useEffect', topic: 'React', difficulty: 'medium', askedAt: new Date(), rating: 4, note: 'good' },
      ],
    });

    const out = await svc.detail('c1');

    expect(out.interviews[0].copilotQuestions).toHaveLength(1);
    expect(out.interviews[0].copilotQuestions[0].text).toBe('Explain useEffect');
  });

  test('returns reviews array from reviewRepository.findAllByCandidate', async () => {
    candidateRepository.findById.mockResolvedValue({ id: 'c1', _id: 'c1', name: 'X', email: 'x@e.com' });
    interviewRepository.list.mockResolvedValue({ items: [] });
    reviewRepository.findAllByCandidate.mockResolvedValue([
      { _id: 'r1', interview: 'iv1', ratings: { knowledge: 4, communication: 5, confidence: 4 }, comments: 'OK', submittedAt: new Date() },
    ]);
    liveSessionRepository.findLatestByInterview.mockResolvedValue(null);

    const out = await svc.detail('c1');

    expect(out.reviews).toHaveLength(1);
    expect(out.reviews[0].interview).toBe('iv1');
  });

  test('empty arrays when no interviews / reviews exist', async () => {
    candidateRepository.findById.mockResolvedValue({ id: 'c1', _id: 'c1', name: 'X', email: 'x@e.com' });
    interviewRepository.list.mockResolvedValue({ items: [] });
    reviewRepository.findAllByCandidate.mockResolvedValue([]);

    const out = await svc.detail('c1');

    expect(out.interviews).toEqual([]);
    expect(out.reviews).toEqual([]);
    // liveSessionRepository is not called when there are no interviews
    expect(liveSessionRepository.findLatestByInterview).not.toHaveBeenCalled();
  });

  test('preserves existing candidate and submission fields (backwards compat)', async () => {
    candidateRepository.findById.mockResolvedValue({ id: 'c1', _id: 'c1', name: 'X', email: 'x@e.com' });
    submissionRepository.findByCandidate.mockResolvedValue({ score: 80, outcome: 'shortlisted' });
    interviewRepository.list.mockResolvedValue({ items: [] });
    reviewRepository.findAllByCandidate.mockResolvedValue([]);

    const out = await svc.detail('c1');

    expect(out.candidate).toBeDefined();
    expect(out.candidate.id).toBe('c1');
    expect(out.submission).toEqual({ score: 80, outcome: 'shortlisted' });
  });
});
```

You may need to import `liveSessionRepository` at the top of the test file if it isn't imported yet:

```js
const liveSessionRepository = require('../../src/repositories/liveSessionRepository');
```

And add a corresponding `jest.mock('../../src/repositories/liveSessionRepository');` line near the other repo mocks.

- [ ] **Step 3: Run tests to confirm they fail**

Run from `backend/`:

```
npx jest tests/unit/candidateService.test.js -t "multi-round timeline payload" --no-coverage
```

Expected: 5 tests FAIL — `out.interviews` is undefined.

- [ ] **Step 4: Implement the service extension**

Edit `backend/src/services/candidateService.js`. Find the existing `detail` function (around line 176):

```js
const detail = async (id) => {
  const candidate = await candidateRepository.findById(id);
  if (!candidate) throw ApiError.notFound('Candidate not found');
  const submission = await submissionRepository.findByCandidate(id);
  return { candidate: presentCandidate(candidate), submission };
};
```

Add a `liveSessionRepository` import at the top of the file (near the other repo imports — around line 6):

```js
const liveSessionRepository = require('../repositories/liveSessionRepository');
```

Then add a small presenter just above `detail` (after `presentCandidate`):

```js
const presentInterviewLite = (iv) => ({
  id: iv._id?.toString?.() || iv.id,
  _id: iv._id?.toString?.() || iv.id,
  round: iv.round,
  roundType: iv.roundType,
  status: iv.status,
  scheduledAt: iv.scheduledAt,
  completedAt: iv.completedAt,
  durationMinutes: iv.durationMinutes,
  notes: iv.notes,
  interviewer: iv.interviewer
    ? { id: iv.interviewer._id?.toString?.() || iv.interviewer.id, name: iv.interviewer.name }
    : null,
});

const presentCopilotQuestion = (q) => ({
  text: q.text,
  topic: q.topic,
  difficulty: q.difficulty,
  askedAt: q.askedAt,
  rating: q.rating,
  note: q.note,
});
```

Replace `detail` with:

```js
const detail = async (id) => {
  const candidate = await candidateRepository.findById(id);
  if (!candidate) throw ApiError.notFound('Candidate not found');
  const submission = await submissionRepository.findByCandidate(id);

  const interviewsRaw = (await interviewRepository.list({ candidateId: id, limit: 100 })).items || [];
  const interviewsSorted = [...interviewsRaw].sort((a, b) => (a.round || 0) - (b.round || 0));

  // Fetch copilot session per interview in parallel; missing sessions yield [].
  const sessionsByInterview = await Promise.all(
    interviewsSorted.map((iv) => liveSessionRepository.findLatestByInterview(iv._id || iv.id)),
  );

  const interviews = interviewsSorted.map((iv, idx) => {
    const session = sessionsByInterview[idx];
    const askedQuestions = (session?.questions || []).filter((q) => q.askedAt);
    return {
      ...presentInterviewLite(iv),
      copilotQuestions: askedQuestions.map(presentCopilotQuestion),
    };
  });

  const reviews = await reviewRepository.findAllByCandidate(id);

  return {
    candidate: presentCandidate(candidate),
    submission,
    interviews,
    reviews,
  };
};
```

- [ ] **Step 5: Run the new tests — confirm green**

Run from `backend/`:

```
npx jest tests/unit/candidateService.test.js -t "multi-round timeline payload" --no-coverage
```

Expected: 5 PASS.

- [ ] **Step 6: Run the full backend suite — confirm no regressions**

```
npx jest --no-coverage
```

Expected: all suites pass (was 201 after yesterday's work — should now be 206).

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/candidateService.js backend/tests/unit/candidateService.test.js
git commit -m "feat(candidate-detail): include interviews, reviews, and copilot questions in detail payload"
```

---

### Task 2: Frontend — persist `interviews` and `reviews` in the candidate slice

**Files:**
- Modify: `frontend/src/features/candidates/candidateSlice.js`

- [ ] **Step 1: Add slice state and reducer update**

Open `frontend/src/features/candidates/candidateSlice.js`. Update the `initialState` (around line 5) to include the new fields:

```js
const initialState = {
  list: [],
  meta: { page: 1, limit: 20, total: 0, totalPages: 1 },
  filters: { search: '', status: '', techStack: '' },
  selected: null,
  selectedSubmission: null,
  selectedInterviews: [],
  selectedReviews: [],
  current: null,
  currentStatus: 'idle',
  stats: {},
  status: 'idle',
  error: null,
  createStatus: 'idle',
};
```

Update the `clearSelected` reducer (around line 114) to also clear the new fields:

```js
    clearSelected(state) {
      state.selected = null;
      state.selectedSubmission = null;
      state.selectedInterviews = [];
      state.selectedReviews = [];
    },
```

Update the `fetchCandidate.fulfilled` case (around line 138) to populate them:

```js
      .addCase(fetchCandidate.fulfilled, (state, action) => {
        state.currentStatus = 'succeeded';
        state.current = action.payload.candidate;
        state.selected = action.payload.candidate;
        state.selectedSubmission = action.payload.submission;
        state.selectedInterviews = action.payload.interviews || [];
        state.selectedReviews = action.payload.reviews || [];
      })
```

- [ ] **Step 2: Verify the file is syntactically valid**

Run from `frontend/`:

```
node --input-type=module -e "import('./src/features/candidates/candidateSlice.js').then(() => console.log('OK'))" 2>/dev/null || echo "ES module check not applicable — run lint instead"
npm run lint -- src/features/candidates/candidateSlice.js 2>&1 | tail -5
```

If lint isn't set up per-file, run `npm run build` instead and confirm it completes.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/candidates/candidateSlice.js
git commit -m "feat(candidates): persist interviews + reviews from detail response in slice"
```

---

### Task 3: Frontend — extend `ScheduleInterviewModal` for create-with-prefill

**Files:**
- Modify: `frontend/src/features/interviews/ScheduleInterviewModal.jsx`

- [ ] **Step 1: Add `prefill` prop and pre-population logic**

Open `frontend/src/features/interviews/ScheduleInterviewModal.jsx`. Change the function signature (line 45) from:

```jsx
export default function ScheduleInterviewModal({ open, onClose, initial }) {
```

to:

```jsx
export default function ScheduleInterviewModal({ open, onClose, initial, prefill }) {
```

Replace the `useEffect` block that runs on `open` (around line 61-102) — specifically the `if (isEdit && initial)` branch. Update so that when `prefill` is passed (and we're NOT editing), the form is pre-populated with the candidate and round type, and the candidate dropdown gets disabled.

Current code:

```jsx
    if (isEdit && initial) {
      setForm({
        candidateId: initial.candidate?.id || initial.candidate || '',
        interviewerId: initial.interviewer?.id || initial.interviewer || '',
        scheduledAt: initial.scheduledAt || '',
        durationMinutes: initial.durationMinutes || 45,
        meetingUrl: initial.meetingUrl || '',
        notes: initial.notes || '',
        roundType: initial.roundType || 'technical',
      });
      setMode('manual'); // editing existing — always show the URL field
    } else {
      setForm(initialForm());
    }
```

Replace with:

```jsx
    if (isEdit && initial) {
      setForm({
        candidateId: initial.candidate?.id || initial.candidate || '',
        interviewerId: initial.interviewer?.id || initial.interviewer || '',
        scheduledAt: initial.scheduledAt || '',
        durationMinutes: initial.durationMinutes || 45,
        meetingUrl: initial.meetingUrl || '',
        notes: initial.notes || '',
        roundType: initial.roundType || 'technical',
      });
      setMode('manual'); // editing existing — always show the URL field
    } else if (prefill) {
      setForm({
        ...initialForm(),
        candidateId: prefill.candidateId || '',
        roundType: prefill.roundType || 'technical',
      });
    } else {
      setForm(initialForm());
    }
```

- [ ] **Step 2: Disable candidate dropdown when prefilled**

Find the candidate `<select>` (around line 241-251) which currently has:

```jsx
            disabled={isEdit || loadingData}
```

Change it to:

```jsx
            disabled={isEdit || !!prefill || loadingData}
```

- [ ] **Step 3: Update the candidate-list dependency for the effect**

In the same useEffect, the `load()` function currently fetches the candidate list filtered to schedulable statuses. When `prefill` is given and the candidate is pinned, we still need their option in the dropdown. Update the eligible-candidates filter:

Find:

```jsx
        const eligible = (cData.items || []).filter((c) => SCHEDULEABLE_STATUSES.has(c.status));
        setCandidates(eligible);
```

Replace with:

```jsx
        const eligible = (cData.items || []).filter((c) => SCHEDULEABLE_STATUSES.has(c.status));
        // If prefilled with a candidate that isn't in the eligible list (e.g., status
        // transitioned), still show them so the dropdown displays their name.
        if (prefill?.candidateId && !eligible.find((c) => c.id === prefill.candidateId)) {
          const pinned = (cData.items || []).find((c) => c.id === prefill.candidateId);
          if (pinned) eligible.unshift(pinned);
        }
        setCandidates(eligible);
```

- [ ] **Step 4: Add `prefill` to the useEffect dependency list**

Find the eslint-disabled dep array at the end of the effect:

```jsx
  }, [open, isEdit, initial, dispatch]); // eslint-disable-line react-hooks/exhaustive-deps
```

Update to:

```jsx
  }, [open, isEdit, initial, prefill, dispatch]); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 5: Verify frontend builds**

Run from `frontend/`:

```
npm run build
```

Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/interviews/ScheduleInterviewModal.jsx
git commit -m "feat(schedule-modal): accept prefill prop to lock candidate + seed round type"
```

---

### Task 4: Frontend — new `CandidateTimeline` component (no inline expand yet)

**Files:**
- Create: `frontend/src/features/candidates/CandidateTimeline.jsx`
- Create: `frontend/src/features/candidates/CandidateTimeline.scss`

- [ ] **Step 1: Create the component file with stepper layout (no expand)**

Create `frontend/src/features/candidates/CandidateTimeline.jsx`:

```jsx
import { useMemo, useState } from 'react';
import Button from '@/components/common/Button';
import { formatDate } from '@/utils/formatters';
import './CandidateTimeline.scss';

const ROUND_TYPE_LABEL = {
  technical: 'Technical',
  practical: 'Practical',
  hr_culture: 'HR-Culture',
};

const STATUS_META = {
  completed:             { icon: '✓', label: 'Completed',         tone: 'ok' },
  scheduled:             { icon: '📅', label: 'Scheduled',         tone: 'sched' },
  reschedule_requested:  { icon: '↻', label: 'Reschedule pending', tone: 'warn' },
  cancelled:             { icon: '✕', label: 'Cancelled',          tone: 'cancel' },
};

const NEXT_ROUND_TYPE = ['technical', 'practical', 'hr_culture'];

const eligibleForNextRound = (interviews, reviews, candidateStatus) => {
  if (!interviews?.length) return null;
  const last = interviews[interviews.length - 1];
  if (last.status !== 'completed') return null;
  const hasReview = reviews.some((r) => String(r.interview) === String(last._id || last.id));
  if (!hasReview) return { reason: 'needs-review' };
  if ((last.round || 0) >= 3) return null;
  const ok = ['awaiting_decision', 'selected_for_culture', 'shortlisted'].includes(candidateStatus);
  if (!ok) return null;
  const nextRoundType = NEXT_ROUND_TYPE[last.round] || 'practical';
  return { nextRoundType };
};

export default function CandidateTimeline({ candidate, interviews = [], reviews = [], onScheduleNext, onShowNotes }) {
  const [expandedId, setExpandedId] = useState(null);
  const reviewByInterview = useMemo(() => {
    const map = new Map();
    for (const r of reviews) map.set(String(r.interview), r);
    return map;
  }, [reviews]);

  const next = eligibleForNextRound(interviews, reviews, candidate?.status);

  if (interviews.length === 0) {
    return (
      <div className="ctl ctl--empty">
        <h3 className="ctl__heading">Interview history</h3>
        <p className="ctl__empty-msg">No interviews scheduled yet.</p>
        {['shortlisted', 'awaiting_decision', 'selected_for_culture'].includes(candidate?.status) && (
          <Button size="sm" onClick={() => onScheduleNext?.({ roundType: 'technical' })}>
            + Schedule interview
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="ctl">
      <h3 className="ctl__heading">Interview history</h3>

      <ol className="ctl__stepper">
        {interviews.map((iv) => {
          const meta = STATUS_META[iv.status] || STATUS_META.scheduled;
          const review = reviewByInterview.get(String(iv._id || iv.id));
          const isExpanded = expandedId === (iv._id || iv.id);
          const isCancelled = iv.status === 'cancelled';
          return (
            <li key={iv._id || iv.id} className={`ctl__node ctl__node--${meta.tone}`}>
              <button
                type="button"
                className="ctl__dot"
                onClick={() => setExpandedId(isExpanded ? null : (iv._id || iv.id))}
                aria-expanded={isExpanded}
                disabled={isCancelled && !review}
              >
                <span className="ctl__dot-icon">{meta.icon}</span>
              </button>
              <div className="ctl__caption">
                <div className="ctl__caption-line">R{iv.round} · {ROUND_TYPE_LABEL[iv.roundType] || iv.roundType}</div>
                <div className="ctl__caption-line">{meta.label} · {iv.scheduledAt ? formatDate(iv.scheduledAt) : ''}</div>
                {iv.interviewer?.name && <div className="ctl__caption-line ctl__caption-line--sub">{iv.interviewer.name}</div>}
              </div>
            </li>
          );
        })}

        {next && (
          <li className="ctl__node ctl__node--next">
            <button
              type="button"
              className="ctl__dot ctl__dot--next"
              onClick={() => next.nextRoundType && onScheduleNext?.({ roundType: next.nextRoundType })}
              disabled={!next.nextRoundType}
              title={next.reason === 'needs-review' ? "Submit the previous round's review before scheduling the next." : ''}
            >
              <span className="ctl__dot-icon">+</span>
            </button>
            <div className="ctl__caption">
              <div className="ctl__caption-line">Schedule next round</div>
              {next.nextRoundType && (
                <div className="ctl__caption-line ctl__caption-line--sub">{ROUND_TYPE_LABEL[next.nextRoundType]}</div>
              )}
              {next.reason === 'needs-review' && (
                <div className="ctl__caption-line ctl__caption-line--sub">Awaiting review</div>
              )}
            </div>
          </li>
        )}
      </ol>

      {expandedId && (() => {
        const iv = interviews.find((x) => (x._id || x.id) === expandedId);
        if (!iv) return null;
        const review = reviewByInterview.get(String(iv._id || iv.id));
        return (
          <div className="ctl__expand">
            <div className="ctl__expand-head">
              R{iv.round} · {ROUND_TYPE_LABEL[iv.roundType] || iv.roundType}
              {iv.interviewer?.name ? ` · ${iv.interviewer.name}` : ''}
              {iv.scheduledAt ? ` · ${formatDate(iv.scheduledAt)}` : ''}
            </div>
            {iv.status === 'cancelled' && (
              <div className="ctl__expand-body ctl__expand-body--muted">
                Cancelled — {iv.notes || 'no reason provided'}
              </div>
            )}
            {iv.status !== 'cancelled' && !review && (
              <div className="ctl__expand-body ctl__expand-body--muted">
                (No review yet — the interviewer hasn't submitted.)
              </div>
            )}
            {review && (
              <div className="ctl__expand-body">
                <div className="ctl__ratings">
                  <span>Knowledge <strong>{review.ratings?.knowledge ?? '—'}/5</strong></span>
                  <span>Communication <strong>{review.ratings?.communication ?? '—'}/5</strong></span>
                  <span>Confidence <strong>{review.ratings?.confidence ?? '—'}/5</strong></span>
                </div>
                {review.comments && <p className="ctl__comments">{review.comments}</p>}
                {iv.status === 'completed' && (iv.copilotQuestions?.length > 0) && (
                  <button
                    type="button"
                    className="ctl__notes-link"
                    onClick={() => onShowNotes?.(iv.copilotQuestions)}
                  >
                    View co-pilot notes →
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
```

- [ ] **Step 2: Create the SCSS file**

Create `frontend/src/features/candidates/CandidateTimeline.scss`:

```scss
.ctl {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: $radius-lg;
  padding: $space-4;
  margin-top: $space-4;

  &--empty { text-align: center; }

  &__heading {
    margin: 0 0 $space-3;
    font-size: 14px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #475569;
  }

  &__empty-msg {
    color: #6b7280;
    font-size: 13px;
    margin: 0 0 $space-2;
  }

  &__stepper {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 28px;
    align-items: flex-start;
    position: relative;
  }

  &__node {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    min-width: 96px;
    position: relative;

    &:not(:last-child)::after {
      content: '';
      position: absolute;
      top: 22px;
      left: calc(100% + 4px);
      width: 24px;
      height: 2px;
      background: #cbd5e1;
    }

    &--ok::after     { background: #16a34a; }
    &--sched::after  { background: #2563eb; }
    &--warn::after   { background: #d97706; }
    &--cancel::after { background: #cbd5e1; }
  }

  &__dot {
    width: 44px;
    height: 44px;
    border-radius: 9999px;
    border: 2px solid #cbd5e1;
    background: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: transform 0.1s, box-shadow 0.1s;

    &:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 2px 8px rgba(15, 23, 42, 0.12);
    }
    &:disabled { cursor: not-allowed; opacity: 0.7; }

    .ctl__node--ok &     { background: #16a34a; border-color: #16a34a; color: #fff; }
    .ctl__node--sched &  { background: #2563eb; border-color: #2563eb; color: #fff; }
    .ctl__node--warn &   { background: #d97706; border-color: #d97706; color: #fff; }
    .ctl__node--cancel & { background: #fff; border-color: #cbd5e1; color: #94a3b8; }

    &--next {
      border-style: dashed;
      border-color: #6366f1;
      color: #4338ca;
      background: #eef2ff;
      &:hover:not(:disabled) { background: #e0e7ff; }
    }
  }

  &__dot-icon { font-size: 18px; line-height: 1; }

  &__caption {
    margin-top: 8px;
    font-size: 12px;
    color: #334155;
  }
  &__caption-line {
    line-height: 1.35;
    &--sub { color: #6b7280; font-size: 11px; }
  }

  &__expand {
    margin-top: $space-3;
    border: 1px solid #e2e8f0;
    border-left: 3px solid #6366f1;
    border-radius: $radius-md;
    padding: $space-3;
    background: #f8fafc;
  }
  &__expand-head {
    font-weight: 600;
    font-size: 13px;
    color: #1e293b;
    margin-bottom: 6px;
  }
  &__expand-body { font-size: 13px; color: #334155; }
  &__expand-body--muted { color: #6b7280; font-style: italic; }

  &__ratings {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    margin-bottom: 8px;
    span strong { color: #0f172a; margin-left: 4px; }
  }
  &__comments {
    margin: 0 0 8px;
    white-space: pre-wrap;
    line-height: 1.5;
  }
  &__notes-link {
    background: transparent;
    border: 0;
    padding: 0;
    color: #4338ca;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    &:hover { text-decoration: underline; }
  }
}
```

- [ ] **Step 3: Verify build**

Run from `frontend/`:

```
npm run build
```

Expected: build succeeds with no SCSS errors. (The component isn't imported anywhere yet — that happens in Task 5.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/candidates/CandidateTimeline.jsx frontend/src/features/candidates/CandidateTimeline.scss
git commit -m "feat(candidates): CandidateTimeline stepper component + styles"
```

---

### Task 5: Wire `CandidateTimeline` into `CandidateDetailPage`

**Files:**
- Modify: `frontend/src/features/candidates/CandidateDetailPage.jsx`

- [ ] **Step 1: Add imports + state**

Open `frontend/src/features/candidates/CandidateDetailPage.jsx`.

Replace the current import line:

```jsx
import ReviewPanel from '@/features/reviews/ReviewPanel';
```

with:

```jsx
import CandidateTimeline from './CandidateTimeline';
import CopilotNotesModal from '@/features/myInterviews/CopilotNotesModal';
import ScheduleInterviewModal from '@/features/interviews/ScheduleInterviewModal';
```

Update the existing selector (around line 31) to also pull the new fields:

```jsx
  const { current, currentStatus, selectedInterviews, selectedReviews, error } = useSelector((s) => s.candidates);
```

Add state for the new modals just below `promptTestOpen`:

```jsx
  const [scheduleModalState, setScheduleModalState] = useState(null); // null | { roundType }
  const [notesQuestions, setNotesQuestions] = useState(null); // null | copilotQuestions[]
```

- [ ] **Step 2: Replace the ReviewPanel block with the timeline**

Find the existing block (around line 287-289):

```jsx
      {['awaiting_decision', 'selected_for_culture', 'final_rejected'].includes(c.status) && (
        <ReviewPanel candidateId={c.id} />
      )}
```

Replace with:

```jsx
      <CandidateTimeline
        candidate={c}
        interviews={selectedInterviews}
        reviews={selectedReviews}
        onScheduleNext={({ roundType }) => setScheduleModalState({ roundType })}
        onShowNotes={(questions) => setNotesQuestions(questions)}
      />
```

- [ ] **Step 3: Render the two new modals near the existing ones**

Just before the final `</div>` of the component (around line 339, after the existing `AssignPromptTestModal` and confirm-override `Modal`), add:

```jsx
      <ScheduleInterviewModal
        open={!!scheduleModalState}
        onClose={() => setScheduleModalState(null)}
        prefill={scheduleModalState ? { candidateId: c.id, roundType: scheduleModalState.roundType } : undefined}
      />

      <CopilotNotesModal
        open={!!notesQuestions}
        onClose={() => setNotesQuestions(null)}
        session={notesQuestions ? { questions: notesQuestions } : null}
      />
```

- [ ] **Step 4: Refresh on successful schedule**

The `ScheduleInterviewModal` already dispatches `scheduleInterview.fulfilled` and closes itself via `handleClose`. Because the candidate timeline depends on `selectedInterviews`, we need to refetch after the modal closes. Update the modal's `onClose` to also refresh:

Change:

```jsx
        onClose={() => setScheduleModalState(null)}
```

to:

```jsx
        onClose={() => { setScheduleModalState(null); refresh(); }}
```

(`refresh` already exists in the component — line 53: `const refresh = () => dispatch(fetchCandidate(id));`)

- [ ] **Step 5: Verify the build**

Run from `frontend/`:

```
npm run build
```

Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/candidates/CandidateDetailPage.jsx
git commit -m "feat(candidate-detail): replace ReviewPanel with CandidateTimeline + schedule-next modal"
```

---

### Task 6: Manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Start the dev servers**

In two terminals:

```
cd backend && npm run dev
```

```
cd frontend && npm run dev
```

Wait for both to be ready.

- [ ] **Step 2: Open a candidate with NO interviews**

Pick (or create) a candidate whose status is `shortlisted` (or `awaiting_decision`). Open their detail page.

Expected: "Interview history" card shows "No interviews scheduled yet." + a "+ Schedule interview" button.

- [ ] **Step 3: Schedule Round 1 (Technical)**

Click "+ Schedule interview". The modal opens with the candidate field disabled (pinned to this candidate) and Round type defaulted to "Technical". Pick an interviewer + date, click Schedule.

Expected: modal closes, page refreshes; timeline shows one **blue scheduled** R1 node. No "+ Schedule next round" node visible (R1 not completed).

- [ ] **Step 4: Mark R1 complete + submit a review**

Sign in as the interviewer (separate browser/incognito), open the interview, submit ratings + comments to complete the review.

Back as HR, refresh the candidate detail page.

Expected: R1 node turns **green**. A trailing dashed "+ Schedule next round" node appears with caption "Practical".

- [ ] **Step 5: Click the R1 green node — verify expand**

Expected: a row expands below the stepper showing knowledge/communication/confidence ratings + the comments verbatim. If the interviewer used the co-pilot, "View co-pilot notes →" link is present.

Click the link. Expected: `CopilotNotesModal` opens showing the asked questions, topics, ratings, and notes.

- [ ] **Step 6: Click "+ Schedule next round"**

Expected: `ScheduleInterviewModal` opens with candidate pre-selected (disabled dropdown) and Round type pre-set to **Practical**. Schedule it.

Expected: timeline now shows R1 (green) → R2 (blue scheduled). No "+ Schedule next" node (R2 not yet completed).

- [ ] **Step 7: Repeat for R3**

Complete R2 + review → "+ Schedule next" reappears with default **HR-Culture**. Schedule R3. Complete it.

Expected: timeline shows R1, R2, R3 all green. No "+ Schedule next" node (capped at 3).

- [ ] **Step 8: Cancel an interview — verify visual**

Pick an active interview, cancel it via the interview detail page.

Expected on candidate detail: that node renders as a **hollow gray** circle with caption "Cancelled · …". Click it — expand row shows "Cancelled — {note}".

- [ ] **Step 9: Check empty co-pilot case**

For an interview that never used the co-pilot (no LiveSession): expand its node — review shows fine, but "View co-pilot notes" link is NOT rendered (`copilotQuestions` empty).

---

## Self-Review Notes

**Spec coverage check:**
- Backend extension (interviews + reviews + copilotQuestions) → Task 1 ✅
- Slice persistence → Task 2 ✅
- ScheduleInterviewModal pre-fill (locked candidate, roundType default) → Task 3 ✅
- New stepper component with node states (completed/scheduled/reschedule_requested/cancelled) → Task 4 ✅
- Schedule-next eligibility logic (5 conditions, disabled state for "needs review") → Task 4 ✅
- Inline expand with one-at-a-time semantics → Task 4 ✅
- "View co-pilot notes" link gated on `completed` + `copilotQuestions.length > 0` → Task 4 ✅
- Removal of `ReviewPanel` from CandidateDetailPage; component itself preserved for InterviewDetailPage → Task 5 ✅
- Empty state ("No interviews scheduled yet") with conditional "+ Schedule interview" CTA → Task 4 ✅
- Manual verification matching the spec's 10-step test → Task 6 (slightly condensed but covers all critical cases) ✅

**Type/name consistency:**
- `copilotQuestions` consistent across backend presenter, slice, component, modal payload.
- `prefill` (frontend modal prop) — consistent in Task 3 + Task 5.
- `selectedInterviews` / `selectedReviews` (slice state) consistent.
- `eligibleForNextRound` (component helper) used inside Task 4 only — self-contained.

**Out of scope (per spec) — confirmed NOT implemented:**
- No round-context handoff inside the live co-pilot (separate spec).
- No drag-to-reorder, no animated transitions, no Round 4+ support.
- No editing a scheduled round from the timeline (still done via interview detail page).

**Placeholder scan:** no TBDs, no "implement later", every step has full code or a complete command.
