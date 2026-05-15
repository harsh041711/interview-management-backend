# AI Follow-up Suggestions + Auto Voice Notes — Design Spec

**Status:** Approved
**Date:** 2026-05-15
**Audience:** engineers implementing this feature

---

## Goal

On the interview co-pilot page, eliminate the typing-during-interview problem AND give the interviewer AI-tailored follow-ups, with **zero extra clicks beyond what they already do**.

Two coupled features:

1. **Voice auto-transcription** — when the interviewer clicks "Mark asked" on a question (which they already do), the browser starts listening via the Web Speech API. The candidate's answer (and/or interviewer's paraphrase) streams into the note textarea in real time. Mic auto-stops on the next "Mark asked", on "Suggest follow-ups", or on End interview.
2. **AI follow-up suggestions** — each question card has a 💡 button. Clicking it sends `{ questionText, note, topic, difficulty }` to a new stateless backend endpoint; AI returns 2-3 follow-up questions tailored to what's in the note. They render under the note as a read-only list. Not persisted.

---

## End-to-end Flow

```
1. Interviewer clicks "Mark asked" on Q1            ← existing click
       ↓ mic auto-starts (Web Speech API)
       Card shows: 🔴 Listening — click to stop
       ↓
2. Candidate answers; transcript streams into Q1's note textarea live
       ↓ interviewer can correct typos in real time
3. Interviewer clicks 💡 "Suggest follow-ups"  OR  moves to Q2
       ↓ mic auto-stops
       AI suggestions render below the note (2-3 items, read-only)
       ↓
4. Click "Mark asked" on Q2  → Q1 mic stops, Q2 mic starts
```

**Auto-stop triggers (all automatic):**
- Clicking "Mark asked" on a different question → swaps listening to that one
- Clicking 💡 "Suggest follow-ups" on the current question
- Toggling "Mark asked" off (un-asking the question)
- Clicking "End interview"
- Tab switch / page hidden (browsers do this anyway; we ensure clean stop)

---

## Architecture

### Backend (stateless, no schema changes)

| Layer | New / Modified |
|---|---|
| `backend/src/services/liveInterviewAiService.js` | Add `suggestFollowUps({ questionText, note, topic, difficulty })` |
| `backend/src/controllers/liveInterviewController.js` | Add `suggestFollowUps` handler |
| `backend/src/validators/liveInterviewValidator.js` | Add `suggestFollowUpsBody` Joi schema |
| `backend/src/routes/liveInterviewRoutes.js` | Add `POST /ai/suggest-follow-ups` (interviewer auth + `aiLimiter`) |

**Service `suggestFollowUps` prompt:**

```js
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
```

- Call `aiService.askWithFallback(prompt)` (default `{ json: true }` is correct).
- Parse with `aiService.extractJson`.
- Validate: must be `{ suggestions: string[] }` with length 1-5. Trim, drop empty, cap to 3.
- If AI returns no text → `ApiError.serviceUnavailable('AI could not generate suggestions', { code: 'E_AI_FAILED' })`.
- If AI returns invalid shape → `ApiError.serviceUnavailable('AI returned invalid suggestions', { code: 'E_AI_PARSE' })`.
- Return `{ suggestions, provider, model }`.

**Why stateless:** the note may not be flushed to the LiveSession yet (1.2s debounce). Client sends `{ questionText, note }` in the body — no DB read, no race, no per-question ownership check needed.

**Route:**

```js
router.post(
  '/ai/suggest-follow-ups',
  aiLimiter,
  validate(v.suggestFollowUpsBody),
  ctrl.suggestFollowUps,
);
```

### Frontend

| Layer | New / Modified |
|---|---|
| `frontend/src/api/liveInterviewApi.js` | Add `suggestFollowUps({ questionText, note, topic, difficulty })` |
| `frontend/src/features/liveInterview/useLiveTranscript.js` | **NEW** — custom hook that owns the single `SpeechRecognition` instance. Exposes `start(index, onText)`, `stop()`, `isListening`, `currentIndex`, `supported`, `error`. |
| `frontend/src/features/liveInterview/LiveInterviewPage.jsx` | Orchestrates the transcript hook. Passes a wrapped `onFieldChange` so "Mark asked" toggles also start/stop the mic. Auto-stops on End interview. |
| `frontend/src/features/liveInterview/QuestionCard.jsx` | Receives `isListening`, `onSuggestFollowUps`. Renders 🔴 listening indicator above the textarea when active. Adds 💡 button + suggestions block below the textarea (replaces the older "no-button" layout). |
| `frontend/src/features/liveInterview/QuestionCard.scss` | Styles for indicator + button + suggestions list. |

**`useLiveTranscript` interface:**

```js
function useLiveTranscript() {
  // returns:
  // {
  //   supported: boolean,           // Web Speech API available?
  //   isListening: boolean,
  //   currentIndex: number | null,  // question index currently being transcribed
  //   error: string | null,         // 'permission-denied' | 'no-speech' | null
  //   start: (index, onText) => void,  // start listening for that question; onText(chunk) fires repeatedly
  //   stop: () => void,
  // }
}
```

- Singleton `SpeechRecognition` per browser tab (the API doesn't allow multiple).
- `continuous: true`, `interimResults: true`, `lang: 'en-US'` (configurable later).
- On each `result` event, build the final text since last call and invoke `onText(text)` with the chunk.
- On `error` event: set `error`, stop listening. Handle `'not-allowed'` (permission denied) and `'no-speech'` separately.
- On unmount, stop and clean up listeners.

**`LiveInterviewPage` orchestration:**

- Holds the hook instance.
- Wraps the existing `onFieldChange` so that when `field === 'askedAt'`:
  - If marking AS asked: call `transcript.start(index, (chunk) => onFieldChange(index, 'note', existingNote + chunk))`
  - If marking off: call `transcript.stop()`
- Wraps the End interview handler: call `transcript.stop()` before navigating away.
- Passes `isListening`, `currentIndex`, `transcript.stop` down to each `QuestionCard`.

**`QuestionCard` changes:**

Layout when listening:

```
[EASY] [Topic]                            [✓ Asked]
Question text…
┌──────────────────────────────────────────┐
│ 🔴 Listening — click to stop             │  ← only visible when this card is the listening one
└──────────────────────────────────────────┘
┌──────────────────────────────────────────┐
│ they use Redux mostly for forms,         │  ← textarea, streaming + editable
│ haven't tried Zustand…                   │
└──────────────────────────────────────────┘
[💡 Suggest follow-ups]                       ← disabled if note empty
  ┌── Follow-up suggestions ───────────────┐
  • Follow-up 1                             │
  • Follow-up 2                             │
  ↻ Regenerate                              │
  └──────────────────────────────────────────┘
Rating: ★ ★ ★ ★ ★
```

**Local component state (suggestions are not persisted):**

```jsx
const [suggestions, setSuggestions] = useState([]);
const [loading, setLoading] = useState(false);
const [error, setError] = useState('');
```

**Behavior:**

- 💡 button disabled if note is empty.
- Click 💡 → calls `transcript.stop()` (so the mic doesn't keep listening while AI is working), then POSTs to `/me/ai/suggest-follow-ups`, sets `suggestions`.
- Loading: button shows "Generating…" + spinner.
- Error: inline red one-liner; ↻ Regenerate retries.

---

## Browser Compatibility & Fallback

| Browser | Behavior |
|---|---|
| Chrome / Edge / Brave (most Chromium) | Full voice flow works. |
| Safari (some versions) | Partial — `webkitSpeechRecognition` works inconsistently. Treat as supported; on `error`, fall back. |
| Firefox | Not supported. Hook returns `supported: false`. |
| Any other | Same fallback. |

**Fallback path (when `supported === false`):**

- No mic auto-start on "Mark asked".
- No 🔴 listening indicator.
- Textarea works as today — interviewer types manually.
- 💡 button still works (just requires manual typing).
- One-time toast on first card open: "Voice unavailable in this browser — type your note instead. Suggestions still work."

**Permission denied:**

- On first `error: 'not-allowed'`, set hook `error = 'permission-denied'`.
- LiveInterviewPage shows a toast: "Mic blocked. Allow it in browser settings, or type your note instead."
- Subsequent "Mark asked" clicks no longer try to start the mic (until page reload).

---

## Privacy

- Audio never leaves the browser. Web Speech API runs locally (Chrome uses Google's server, but no audio is exposed to our backend — we only see the final text the user has reviewed).
- Mic is OFF until the interviewer clicks "Mark asked".
- Mic stops on tab switch, page hidden, End interview, "Suggest follow-ups", and toggle-off.
- No recording — only live transcription. Once a session ends, the audio is gone (not stored anywhere).

---

## Tests

### Backend — Jest

Add to `backend/tests/unit/liveInterviewAiService.test.js`:

- Happy path: `askWithFallback` mocked to return valid JSON → returns `{ suggestions: [...] }` with up to 3 items.
- AI returns no text → throws 503 with code `E_AI_FAILED`.
- AI returns invalid JSON shape → throws 503 with code `E_AI_PARSE`.
- AI returns >3 suggestions → caps to 3.
- AI returns suggestions with empty / whitespace strings → drops them.

No new route-level integration test needed (the existing auth/validation middleware tests cover it).

### Frontend — Manual

1. Open co-pilot for a scheduled interview in Chrome.
2. Click "Mark asked" on Q1. Browser asks for mic permission → allow.
3. Card shows "🔴 Listening — click to stop". Speak a paraphrase aloud — confirm text streams into the textarea within ~1s.
4. Click "Mark asked" on Q2 → Q1 listening indicator goes away, Q2 starts listening.
5. On Q2, click 💡 Suggest follow-ups → mic stops, 2-3 suggestions render below the note within ~3-5s.
6. Click ↻ Regenerate → new suggestions render.
7. Click End interview → mic stops cleanly (verify by checking browser tab indicator).
8. Reopen co-pilot → suggestions are gone (confirmed not persisted).
9. Open in Firefox → no mic indicator, toast "Voice unavailable", textarea works manually, 💡 still works.
10. Deny mic permission in Chrome → toast "Mic blocked", textarea fallback.

---

## Out of Scope (YAGNI)

- Click-to-add a suggestion as a new question card.
- Coverage-gap detection ("you haven't covered X").
- Saving suggestions or transcripts to the LiveSession.
- Auto-trigger AI suggestions without a click (would burn credits).
- Mic-language picker (locked to `en-US`).
- Server-side speech recognition (Deepgram, Whisper, etc.).
- Recording / replay of the audio.
- "Suggest next question to ask" global button (separate Phase 2 item — coverage gaps).

---

## Future Enhancements (not in this plan)

- Round-context handoff: surface prior round reviews so suggestions account for what's already been asked.
- "Ask this" button to push a suggestion as a new question card in the queue.
- Coverage tracking — periodic AI check that lists JD topics not yet covered.
- Configurable transcription language.
- Suggestion history per question (track which were actually used).
