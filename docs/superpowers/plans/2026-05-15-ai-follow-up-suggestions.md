# AI Follow-up Suggestions + Auto Voice Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 💡 "Suggest follow-ups" to each co-pilot `QuestionCard` and auto-transcribe the candidate's answer into the note when the interviewer clicks "Mark asked" — zero extra clicks during the interview.

**Architecture:** Backend is one new stateless POST endpoint that calls the existing `aiService.askWithFallback` with a focused prompt. Frontend adds a `useLiveTranscript` hook (Web Speech API singleton) wired into `LiveInterviewPage.onFieldChange` so that toggling a question's `askedAt` field starts/stops mic listening on that card.

**Tech Stack:** Node + Express + Mongoose (backend, no schema changes); React + Redux Toolkit + Web Speech API (frontend); Jest for backend tests.

**Spec:** `docs/superpowers/specs/2026-05-15-ai-follow-up-suggestions-design.md`

---

## File Map

### Backend — Modified only

| File | Change |
|---|---|
| `backend/src/services/liveInterviewAiService.js` | Add `suggestFollowUps({ questionText, note, topic, difficulty })`. Export it. |
| `backend/src/validators/liveInterviewValidator.js` | Add `suggestFollowUpsBody` Joi schema. |
| `backend/src/controllers/liveInterviewController.js` | Add `suggestFollowUps` handler. Export it. |
| `backend/src/routes/liveInterviewRoutes.js` | Add `POST /ai/suggest-follow-ups` with `aiLimiter + validate`. |
| `backend/tests/unit/liveInterviewAiService.test.js` | Add `describe('liveInterviewAiService.suggestFollowUps', ...)` with 5 tests. |

### Frontend — Created

| File | Responsibility |
|---|---|
| `frontend/src/features/liveInterview/useLiveTranscript.js` | Custom hook owning the singleton SpeechRecognition; exposes `start(index, onText)`, `stop()`, `isListening`, `currentIndex`, `supported`, `error`. |

### Frontend — Modified

| File | Change |
|---|---|
| `frontend/src/api/liveInterviewApi.js` | Add `suggestFollowUps({ questionText, note, topic, difficulty })`. |
| `frontend/src/features/liveInterview/QuestionCard.jsx` | Add listening indicator (when `isListening && currentIndex === index`), 💡 button below note textarea, suggestions list block, local state for suggestions/loading/error. |
| `frontend/src/features/liveInterview/QuestionCard.scss` | Styles for the indicator, button, suggestions list. |
| `frontend/src/features/liveInterview/LiveInterviewPage.jsx` | Use `useLiveTranscript`. Wrap `onFieldChange` to start/stop mic on `askedAt` toggle. Pass `isListening`, `currentIndex`, `transcriptSupported`, `stopTranscript` down to each card. Stop on End interview. |

---

## Task 1: Backend — AI Service `suggestFollowUps` (with tests)

**Files:**
- Modify: `backend/src/services/liveInterviewAiService.js`
- Modify: `backend/tests/unit/liveInterviewAiService.test.js`

- [ ] **Step 1: Write the failing tests**

Append this block to the end of `backend/tests/unit/liveInterviewAiService.test.js` (after the existing `describe(...)` blocks):

```js
describe('liveInterviewAiService.suggestFollowUps', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns up to 3 suggestions on AI success', async () => {
    aiService.askWithFallback.mockResolvedValue({
      text: JSON.stringify({
        suggestions: ['Q1?', 'Q2?', 'Q3?', 'Q4?'],
      }),
      provider: 'gemini', model: 'gemini-2.5-flash',
    });
    const out = await svc.suggestFollowUps({
      questionText: 'Tell me about Redux.',
      note: 'they use it mostly for forms',
      topic: 'React',
      difficulty: 'medium',
    });
    expect(out.suggestions).toEqual(['Q1?', 'Q2?', 'Q3?']);
    expect(out.provider).toBe('gemini');
  });

  test('drops empty / whitespace suggestions', async () => {
    aiService.askWithFallback.mockResolvedValue({
      text: JSON.stringify({ suggestions: ['Q1?', '   ', '', 'Q2?'] }),
      provider: 'gemini', model: 'gemini-2.5-flash',
    });
    const out = await svc.suggestFollowUps({
      questionText: 'Q', note: 'n',
    });
    expect(out.suggestions).toEqual(['Q1?', 'Q2?']);
  });

  test('throws 503 E_AI_FAILED when AI returns no text', async () => {
    aiService.askWithFallback.mockResolvedValue({
      text: null, provider: null, model: null,
    });
    await expect(svc.suggestFollowUps({
      questionText: 'Q', note: 'n',
    })).rejects.toMatchObject({ statusCode: 503, code: 'E_AI_FAILED' });
  });

  test('throws 503 E_AI_PARSE when JSON is invalid shape (no suggestions array)', async () => {
    aiService.askWithFallback.mockResolvedValue({
      text: JSON.stringify({ unexpected: 'shape' }),
      provider: 'gemini', model: 'gemini-2.5-flash',
    });
    await expect(svc.suggestFollowUps({
      questionText: 'Q', note: 'n',
    })).rejects.toMatchObject({ statusCode: 503, code: 'E_AI_PARSE' });
  });

  test('throws 503 E_AI_PARSE when AI returns unparseable text', async () => {
    aiService.askWithFallback.mockResolvedValue({
      text: 'not json at all',
      provider: 'gemini', model: 'gemini-2.5-flash',
    });
    await expect(svc.suggestFollowUps({
      questionText: 'Q', note: 'n',
    })).rejects.toMatchObject({ statusCode: 503, code: 'E_AI_PARSE' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd backend && npm test -- liveInterviewAiService
```
Expected: 5 new tests FAIL with `svc.suggestFollowUps is not a function`.

- [ ] **Step 3: Add the prompt builder and service method**

Edit `backend/src/services/liveInterviewAiService.js`. At the top, add `ApiError` import (if missing) and below the existing prompt builders, add:

```js
const ApiError = require('../utils/ApiError');

const buildFollowUpPrompt = ({ questionText, note, topic, difficulty }) => `You are helping an interviewer ask better follow-up questions during a live technical interview.

Question that was asked:
"""${questionText}"""

${topic ? `Topic: ${topic}\n` : ''}${difficulty ? `Difficulty: ${difficulty}\n` : ''}
Interviewer's note about the candidate's answer (transcribed or paraphrased — may be incomplete):
"""${note}"""

Generate 2-3 follow-up questions that probe deeper into the candidate's answer.
- Stay on the same topic.
- Prefer concrete, specific questions over generic ones.
- Test depth of understanding, not memorization.
- Each follow-up should be one sentence.

Output ONLY valid JSON in this shape (no markdown, no commentary):
{ "suggestions": ["...", "...", "..."] }`;

const suggestFollowUps = async ({ questionText, note, topic, difficulty }) => {
  const prompt = buildFollowUpPrompt({ questionText, note, topic, difficulty });
  const { text, provider, model } = await aiService.askWithFallback(prompt);
  if (!text) {
    logger.warn('live-interview AI returned nothing for follow-up suggestions');
    throw ApiError.serviceUnavailable('AI could not generate suggestions', { code: 'E_AI_FAILED' });
  }
  const parsed = aiService.extractJson(text);
  if (!parsed || !Array.isArray(parsed.suggestions)) {
    logger.warn('live-interview AI: follow-up JSON invalid', { rawSnippet: text.slice(0, 300) });
    throw ApiError.serviceUnavailable('AI returned invalid suggestions', { code: 'E_AI_PARSE' });
  }
  const suggestions = parsed.suggestions
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter((s) => s.length > 0)
    .slice(0, 3);
  return { suggestions, provider, model };
};
```

Update the `module.exports` at the bottom to include `suggestFollowUps`:

```js
module.exports = { generateQuestions, generateDraftReview, suggestFollowUps, buildQuestionsPrompt };
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd backend && npm test -- liveInterviewAiService
```
Expected: all tests PASS (including the 5 new `suggestFollowUps` tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/liveInterviewAiService.js backend/tests/unit/liveInterviewAiService.test.js
git commit -m "feat(live-interview ai): add suggestFollowUps service method with 5 unit tests"
```

---

## Task 2: Backend — Validator Schema

**Files:**
- Modify: `backend/src/validators/liveInterviewValidator.js`

- [ ] **Step 1: Add the Joi schema**

Edit `backend/src/validators/liveInterviewValidator.js`. After the existing `updateBody` declaration and before `module.exports`, add:

```js
const suggestFollowUpsBody = {
  body: Joi.object({
    questionText: Joi.string().min(1).max(2000).required(),
    note:         Joi.string().min(1).max(2000).required(),
    topic:        Joi.string().allow('').max(200).optional(),
    difficulty:   Joi.string().valid('easy', 'medium', 'hard').optional(),
  }),
};
```

Update `module.exports`:

```js
module.exports = { interviewIdParam, sessionIdParam, updateBody, suggestFollowUpsBody };
```

- [ ] **Step 2: Smoke-test the validator loads**

```
cd backend && node -e "const v = require('./src/validators/liveInterviewValidator'); console.log(Object.keys(v).sort().join(','))"
```
Expected output: `interviewIdParam,sessionIdParam,suggestFollowUpsBody,updateBody`

- [ ] **Step 3: Commit**

```bash
git add backend/src/validators/liveInterviewValidator.js
git commit -m "feat(live-interview ai): add suggestFollowUpsBody Joi schema"
```

---

## Task 3: Backend — Controller + Route

**Files:**
- Modify: `backend/src/controllers/liveInterviewController.js`
- Modify: `backend/src/routes/liveInterviewRoutes.js`

- [ ] **Step 1: Add the AI service import**

Edit `backend/src/controllers/liveInterviewController.js`. The current top imports look like:

```js
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/ApiResponse');
const svc = require('../services/liveInterviewService');
```

Add a second service import below the existing `svc` line:

```js
const aiSvc = require('../services/liveInterviewAiService');
```

- [ ] **Step 2: Add the handler and update exports**

After the existing `getLatest` handler and before `module.exports`, add:

```js
const suggestFollowUps = asyncHandler(async (req, res) => {
  const out = await aiSvc.suggestFollowUps({
    questionText: req.body.questionText,
    note: req.body.note,
    topic: req.body.topic,
    difficulty: req.body.difficulty,
  });
  return ok(res, out, 'OK');
});
```

Update `module.exports` to include the new handler:

```js
module.exports = { start, getActive, updateQuestions, end, getLatest, suggestFollowUps };
```

- [ ] **Step 3: Add the route**

Edit `backend/src/routes/liveInterviewRoutes.js`. The current routes use `requireAuth, requireRole('interviewer')` at the top via `router.use(...)`. Add the new route below the existing ones, before `module.exports`:

```js
router.post(
  '/ai/suggest-follow-ups',
  aiLimiter,
  validate(v.suggestFollowUpsBody),
  ctrl.suggestFollowUps,
);
```

(`aiLimiter`, `validate`, `v`, and `ctrl` are already imported at the top of the file.)

- [ ] **Step 4: Smoke-test route mounting**

```
cd backend && node -e "require('./src/routes/liveInterviewRoutes')"
```
Expected: no output, exit 0.

- [ ] **Step 5: Run the full backend test suite**

```
cd backend && npm test
```
Expected: all tests pass (196 total — 191 existing + 5 new).

- [ ] **Step 6: Commit**

```bash
git add backend/src/controllers/liveInterviewController.js backend/src/routes/liveInterviewRoutes.js
git commit -m "feat(live-interview ai): wire suggest-follow-ups controller + route"
```

---

## Task 4: Frontend — API Client Method

**Files:**
- Modify: `frontend/src/api/liveInterviewApi.js`

- [ ] **Step 1: Add the API method**

Edit `frontend/src/api/liveInterviewApi.js`. The existing object has methods like `start`, `getActive`, etc. Add `suggestFollowUps` as a new property:

```js
suggestFollowUps: ({ questionText, note, topic, difficulty }) =>
  apiClient
    .post('/me/ai/suggest-follow-ups', { questionText, note, topic, difficulty })
    .then((r) => r.data.data),
```

The final file should look like (replace the entire object literal):

```js
import { apiClient } from './axios';

export const liveInterviewApi = {
  start: (interviewId) =>
    apiClient.post(`/me/interviews/${interviewId}/live/start`).then((r) => r.data.data.session),
  getActive: (interviewId) =>
    apiClient.get(`/me/interviews/${interviewId}/live`).then((r) => r.data.data.session),
  updateQuestions: (sessionId, questionUpdates) =>
    apiClient.patch(`/me/live-sessions/${sessionId}`, { questionUpdates }).then((r) => r.data.data.session),
  end: (sessionId) =>
    apiClient.post(`/me/live-sessions/${sessionId}/end`).then((r) => r.data.data.session),
  getCopilotNotes: (interviewId) =>
    apiClient.get(`/me/interviews/${interviewId}/copilot-notes`).then((r) => r.data.data.session),
  suggestFollowUps: ({ questionText, note, topic, difficulty }) =>
    apiClient
      .post('/me/ai/suggest-follow-ups', { questionText, note, topic, difficulty })
      .then((r) => r.data.data),
};
```

- [ ] **Step 2: Smoke-test build**

```
cd frontend && npm run build
```
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/liveInterviewApi.js
git commit -m "feat(live-interview ai): add suggestFollowUps API client method"
```

---

## Task 5: Frontend — `useLiveTranscript` Hook

**Files:**
- Create: `frontend/src/features/liveInterview/useLiveTranscript.js`

- [ ] **Step 1: Create the hook file**

Create `frontend/src/features/liveInterview/useLiveTranscript.js`:

```js
import { useCallback, useEffect, useRef, useState } from 'react';

// Returns the SpeechRecognition class for the current browser, or null if
// unavailable. We check both the prefixed and unprefixed names because
// Chrome uses `webkitSpeechRecognition`, some other Chromium browsers
// expose `SpeechRecognition` directly.
const getRecognitionCtor = () => {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
};

/**
 * Owns a single SpeechRecognition instance for the tab and exposes a
 * controlled start/stop API tied to question indexes on the co-pilot page.
 *
 * Usage from LiveInterviewPage:
 *   const t = useLiveTranscript();
 *   if (t.supported) t.start(index, (chunk) => onFieldChange(index, 'note', existingNote + chunk));
 *   t.stop();
 */
export default function useLiveTranscript() {
  const ctorRef = useRef(getRecognitionCtor());
  const recogRef = useRef(null);
  const onTextRef = useRef(null);
  const currentIndexRef = useRef(null);

  const [supported] = useState(() => !!getRecognitionCtor());
  const [isListening, setIsListening] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(null);
  const [error, setError] = useState(null);

  const stop = useCallback(() => {
    const r = recogRef.current;
    if (r) {
      try { r.stop(); } catch { /* ignore */ }
    }
    recogRef.current = null;
    onTextRef.current = null;
    currentIndexRef.current = null;
    setIsListening(false);
    setCurrentIndex(null);
  }, []);

  const start = useCallback((index, onText) => {
    const Ctor = ctorRef.current;
    if (!Ctor) return;
    // Stop any prior recognition before swapping to a new question.
    if (recogRef.current) {
      try { recogRef.current.stop(); } catch { /* ignore */ }
    }
    const recog = new Ctor();
    recog.continuous = true;
    recog.interimResults = true;
    recog.lang = 'en-US';
    recog.onresult = (event) => {
      // Build only the FINAL transcript chunks added since last fire.
      let finalChunk = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const r = event.results[i];
        if (r.isFinal) finalChunk += r[0].transcript;
      }
      if (finalChunk && onTextRef.current) {
        onTextRef.current(finalChunk);
      }
    };
    recog.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setError('permission-denied');
        stop();
      } else if (event.error === 'no-speech') {
        // Browser auto-stops after silence; just clean up state.
        stop();
      } else {
        setError(event.error || 'unknown');
        stop();
      }
    };
    recog.onend = () => {
      // Recognition can end on its own (e.g., after long silence). Reflect that.
      if (recogRef.current === recog) {
        recogRef.current = null;
        onTextRef.current = null;
        currentIndexRef.current = null;
        setIsListening(false);
        setCurrentIndex(null);
      }
    };
    recogRef.current = recog;
    onTextRef.current = onText;
    currentIndexRef.current = index;
    setIsListening(true);
    setCurrentIndex(index);
    setError(null);
    try {
      recog.start();
    } catch (e) {
      // .start() throws if called twice rapidly; surface as an error and clean up.
      setError(e.message || 'start-failed');
      stop();
    }
  }, [stop]);

  // Tab/page hidden → stop the mic for privacy and battery.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && recogRef.current) stop();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [stop]);

  // Stop on unmount.
  useEffect(() => () => { stop(); }, [stop]);

  return { supported, isListening, currentIndex, error, start, stop };
}
```

- [ ] **Step 2: Smoke-test build**

```
cd frontend && npm run build
```
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/liveInterview/useLiveTranscript.js
git commit -m "feat(live-interview): useLiveTranscript hook — Web Speech API singleton"
```

---

## Task 6: Frontend — `QuestionCard` Updates

**Files:**
- Modify: `frontend/src/features/liveInterview/QuestionCard.jsx`
- Modify: `frontend/src/features/liveInterview/QuestionCard.scss`

- [ ] **Step 1: Update QuestionCard.jsx**

Replace the entire contents of `frontend/src/features/liveInterview/QuestionCard.jsx` with:

```jsx
import { useState } from 'react';
import { liveInterviewApi } from '@/api/liveInterviewApi';
import './QuestionCard.scss';

const DIFFICULTY_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

export default function QuestionCard({
  question,
  index,
  onChange,
  isListening = false,
  onStopListening,
}) {
  const asked = !!question.askedAt;
  const onToggleAsked = () => onChange(index, 'askedAt', asked ? null : new Date().toISOString());
  const onNote = (e) => onChange(index, 'note', e.target.value);
  const onRate = (n) => onChange(index, 'rating', n);

  const [suggestions, setSuggestions] = useState([]);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState('');

  const note = question.note || '';
  const canSuggest = !suggesting && note.trim().length > 0;

  const onSuggest = async () => {
    if (!canSuggest) return;
    if (isListening && onStopListening) onStopListening();
    setSuggesting(true);
    setSuggestError('');
    setSuggestions([]);
    try {
      const out = await liveInterviewApi.suggestFollowUps({
        questionText: question.text,
        note,
        topic: question.topic,
        difficulty: question.difficulty,
      });
      setSuggestions(out.suggestions || []);
    } catch (err) {
      setSuggestError(err?.response?.data?.message || 'Couldn’t generate suggestions — try again.');
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <div className={`qc ${asked ? 'qc--asked' : ''}`}>
      <div className="qc__head">
        <span className={`qc__diff qc__diff--${question.difficulty}`}>
          {DIFFICULTY_LABEL[question.difficulty] || question.difficulty}
        </span>
        {question.topic && <span className="qc__topic">{question.topic}</span>}
        <button type="button" className="qc__toggle" onClick={onToggleAsked}>
          {asked ? '✓ Asked' : 'Mark asked'}
        </button>
      </div>
      <div className="qc__text">{question.text}</div>

      {isListening && (
        <button
          type="button"
          className="qc__listening"
          onClick={onStopListening}
          aria-label="Stop listening"
        >
          <span className="qc__listening-dot" /> Listening — click to stop
        </button>
      )}

      <textarea
        className="qc__note"
        placeholder="Note will appear here as you (or the candidate) speak…"
        value={note}
        onChange={onNote}
        maxLength={500}
        rows={2}
      />

      <div className="qc__suggest-row">
        <button
          type="button"
          className="qc__suggest-btn"
          onClick={onSuggest}
          disabled={!canSuggest}
        >
          {suggesting ? 'Generating…' : '💡 Suggest follow-ups'}
        </button>
      </div>

      {suggestError && (
        <div className="qc__suggest-error">{suggestError}</div>
      )}

      {suggestions.length > 0 && (
        <div className="qc__suggestions">
          <div className="qc__suggestions-head">
            Follow-up suggestions
            <button type="button" className="qc__regen" onClick={onSuggest} disabled={suggesting}>
              ↻ Regenerate
            </button>
          </div>
          <ul>
            {suggestions.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}

      <div className="qc__rate">
        <span>Rating:</span>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            type="button"
            key={n}
            className={`qc__star ${n <= (question.rating || 0) ? 'qc__star--on' : ''}`}
            onClick={() => onRate(question.rating === n ? null : n)}
            aria-label={`${n} star`}
          >★</button>
        ))}
        <span className="qc__rate-val">{question.rating ? `${question.rating}/5` : '—'}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update QuestionCard.scss**

Append this block to the end of `frontend/src/features/liveInterview/QuestionCard.scss` (inside the `.qc { ... }` block, before its closing brace):

```scss
  &__listening {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: #fee2e2;
    color: #991b1b;
    border: 1px solid #fecaca;
    border-radius: 9999px;
    padding: 4px 12px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    &:hover { background: #fecaca; }
  }
  &__listening-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #dc2626;
    animation: qc-pulse 1.1s ease-in-out infinite;
  }
  @keyframes qc-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%      { opacity: 0.5; transform: scale(0.85); }
  }

  &__suggest-row { display: flex; }
  &__suggest-btn {
    background: #eef2ff;
    color: #3730a3;
    border: 1px solid #c7d2fe;
    border-radius: $radius-md;
    padding: 6px 12px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    &:hover:not(:disabled) { background: #e0e7ff; }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
  }
  &__suggest-error {
    font-size: 12px;
    color: #b91c1c;
  }

  &__suggestions {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-left: 3px solid #6366f1;
    border-radius: $radius-md;
    padding: 10px 12px;
    font-size: 13px;
  }
  &__suggestions-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 700;
    color: #475569;
    margin-bottom: 8px;
  }
  &__regen {
    background: transparent;
    border: 0;
    color: #4338ca;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    &:hover { text-decoration: underline; }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
  }
  &__suggestions ul {
    list-style: disc inside;
    margin: 0;
    padding: 0;
    color: #1e293b;
    li { margin: 4px 0; line-height: 1.45; }
  }
```

- [ ] **Step 3: Smoke-test build**

```
cd frontend && npm run build
```
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/liveInterview/QuestionCard.jsx frontend/src/features/liveInterview/QuestionCard.scss
git commit -m "feat(live-interview): QuestionCard listening indicator + Suggest follow-ups button + suggestions list"
```

---

## Task 7: Frontend — `LiveInterviewPage` Orchestration

**Files:**
- Modify: `frontend/src/features/liveInterview/LiveInterviewPage.jsx`

- [ ] **Step 1: Wire `useLiveTranscript` into the page**

Edit `frontend/src/features/liveInterview/LiveInterviewPage.jsx`.

Near the top, add the hook import (after the other local imports):

```jsx
import useLiveTranscript from './useLiveTranscript';
```

Also import `useRef` from React (it's already imported in this file — leave alone) and `useToast` for the permission-denied case. Check the existing imports — `useToast` should already be imported. If not, add:

```jsx
import { useToast } from '@/components/common/Toast';
```

Inside the `LiveInterviewPage` component, AFTER `const { push } = useToast();` and BEFORE the existing `pendingRef`/`timerRef` declarations, add:

```jsx
const transcript = useLiveTranscript();
const permissionWarnedRef = useRef(false);
```

The handler `onFieldChange` currently looks like:

```jsx
const onFieldChange = (index, field, value) => {
  dispatch(setQuestionField({ index, field, value }));
  pendingRef.current.set(`${index}:${field}`, value);
  if (timerRef.current) clearTimeout(timerRef.current);
  timerRef.current = setTimeout(flushPending, DEBOUNCE_MS);
};
```

Replace it with:

```jsx
const onFieldChange = (index, field, value) => {
  dispatch(setQuestionField({ index, field, value }));
  pendingRef.current.set(`${index}:${field}`, value);
  if (timerRef.current) clearTimeout(timerRef.current);
  timerRef.current = setTimeout(flushPending, DEBOUNCE_MS);

  // When 'Mark asked' toggles, start/stop the mic for that card.
  if (field === 'askedAt') {
    if (value) {
      // Marking as asked → start listening, append transcript chunks to that
      // card's note (read latest from the store inside the callback so we don't
      // capture a stale value).
      transcript.start(index, (chunk) => {
        const q = (session?.questions || [])[index] || {};
        const existing = q.note || '';
        const sep = existing && !existing.endsWith(' ') ? ' ' : '';
        onFieldChange(index, 'note', existing + sep + chunk.trim());
      });
    } else {
      // Toggled off → stop only if this card was the active listener.
      if (transcript.currentIndex === index) transcript.stop();
    }
  }
};
```

Surface the permission-denied error once:

After the `transcript = useLiveTranscript()` line, add a `useEffect` that watches `transcript.error`:

```jsx
useEffect(() => {
  if (transcript.error === 'permission-denied' && !permissionWarnedRef.current) {
    permissionWarnedRef.current = true;
    push({
      type: 'warn',
      message: 'Mic blocked. Allow it in browser settings, or type your note instead.',
    });
  }
}, [transcript.error, push]);
```

Surface the "voice unsupported" warning once on mount:

```jsx
useEffect(() => {
  if (!transcript.supported) {
    push({
      type: 'info',
      message: 'Voice unavailable in this browser — type your notes manually. Suggestions still work.',
    });
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []); // run once on first mount
```

Stop the mic when ending the interview. Find the existing `onEnd` and add a `transcript.stop()` call at the top (before the early-return guards):

```jsx
const onEnd = async () => {
  if (!session || endingRef.current) return;
  endingRef.current = true;
  transcript.stop();                          // ← NEW
  if (timerRef.current) clearTimeout(timerRef.current);
  await flushPending();
  // ...rest unchanged
};
```

Finally, in the JSX, the `QuestionCard` is rendered inside the `live__queue` section. Find:

```jsx
{(session.questions || []).map((q, i) => (
  <QuestionCard key={i} question={q} index={i} onChange={onFieldChange} />
))}
```

Replace with:

```jsx
{(session.questions || []).map((q, i) => (
  <QuestionCard
    key={i}
    question={q}
    index={i}
    onChange={onFieldChange}
    isListening={transcript.isListening && transcript.currentIndex === i}
    onStopListening={transcript.stop}
  />
))}
```

- [ ] **Step 2: Smoke-test build**

```
cd frontend && npm run build
```
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/liveInterview/LiveInterviewPage.jsx
git commit -m "feat(live-interview): orchestrate auto voice transcription on 'Mark asked' toggle"
```

---

## Task 8: End-to-End Manual Verification

**Files:** none (manual test pass)

- [ ] **Step 1: Start both servers**

```
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd frontend && npm run dev
```

- [ ] **Step 2: Open co-pilot for a scheduled interview in Chrome**

Navigate to `/interviewer/dashboard` → click "Open co-pilot" on a scheduled interview within the 15-minute window.

- [ ] **Step 3: Verify 💡 button starts disabled**

On any question card, confirm the "💡 Suggest follow-ups" button is **visible but disabled** (note is empty). Hover should show the disabled state.

- [ ] **Step 4: Verify mic auto-start on "Mark asked"**

Click "Mark asked" on Question 1. First time only: browser asks for mic permission — allow it. The card should show **🔴 Listening — click to stop** above the textarea.

- [ ] **Step 5: Verify transcript streams into the note**

Speak a short phrase aloud (e.g., "they said they use Redux mostly for forms"). Within 1-2 seconds the text should appear in the note textarea. Pause for a second to trigger a `final` result.

- [ ] **Step 6: Verify mic swap on next "Mark asked"**

Click "Mark asked" on Question 2. The Q1 listening indicator disappears; Q2 shows it. Speak again — text goes to Q2's note, not Q1's.

- [ ] **Step 7: Verify 💡 returns 2-3 follow-ups**

On Q2, click "💡 Suggest follow-ups". The mic should stop (indicator goes away), button shows "Generating…", and within ~3-5 seconds 2-3 bulleted suggestions render below the button in a soft purple-bordered card. Click "↻ Regenerate" — new suggestions render.

- [ ] **Step 8: Verify toggle-off stops the mic**

On Q3, click "Mark asked" (mic starts). Click "Mark asked" again to toggle off. The listening indicator must disappear.

- [ ] **Step 9: Verify End interview stops mic cleanly**

On Q3, click "Mark asked" (mic starts). Click "End interview". Browser tab indicator should show the mic icon disappear within a second.

- [ ] **Step 10: Verify Firefox fallback**

Open the same co-pilot URL in Firefox. On page load, a toast should say "Voice unavailable in this browser — type your notes manually. Suggestions still work." Click "Mark asked" — no mic indicator, no permission prompt. Type a note manually, click 💡 — suggestions still render.

- [ ] **Step 11: Verify permission-denied path**

Back in Chrome, go to Site Settings and block the mic for `localhost:5173`. Reload the co-pilot, click "Mark asked" — a toast should say "Mic blocked. Allow it in browser settings, or type your note instead." Textarea still works manually.

- [ ] **Step 12: Verify tab-switch stops the mic**

In Chrome with mic allowed, click "Mark asked" on Q4 (mic starts). Switch to another tab. Return to the co-pilot tab — the listening indicator should be gone (the page-hidden effect stops it).

- [ ] **Step 13: Verify suggestions are NOT persisted**

Generate suggestions on Q1. Reload the page. Suggestions should be gone (local state only); notes should still be there.

- [ ] **Step 14: Verify AI failure path**

In a separate terminal, temporarily comment out both AI keys in `backend/.env` (or set them to empty) and restart the backend. Click 💡 — should see "Couldn't generate suggestions — try again." inline error in red below the button. Restore the keys and restart.

- [ ] **Step 15: Commit any incidental fixes**

If anything needed tweaking during manual testing, commit each fix as its own small change:

```bash
git add <file>
git commit -m "fix(live-interview ai): <one-line description>"
```

---

## Self-Review Notes

Cross-checked against the spec:

| Spec section | Covered by |
|---|---|
| Backend service `suggestFollowUps` (prompt, error mapping, capping, dropping empty) | Task 1 |
| 5 unit tests for the service | Task 1 |
| Validator `suggestFollowUpsBody` Joi schema | Task 2 |
| Controller `suggestFollowUps` handler | Task 3 |
| Route `POST /me/ai/suggest-follow-ups` with `aiLimiter + validate + auth` | Task 3 |
| Frontend API client `suggestFollowUps` | Task 4 |
| `useLiveTranscript` hook — singleton, continuous + interim, error mapping, page-hidden auto-stop | Task 5 |
| `QuestionCard` — listening indicator, 💡 button, suggestions list, local state, error display | Task 6 |
| `LiveInterviewPage` — orchestrates start/stop on `askedAt` toggle, stops on End, surfaces permission + unsupported warnings | Task 7 |
| Browser fallback (Firefox, permission-denied) | Tasks 5 + 7, verified Task 8 steps 10-11 |
| Privacy (no audio leaves browser) — confirmed in hook (only chunks via `onText`) | Task 5 |
| Manual verification covering all 15 spec scenarios | Task 8 |
