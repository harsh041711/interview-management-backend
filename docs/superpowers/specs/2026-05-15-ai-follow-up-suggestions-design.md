# AI Follow-up Suggestions — Design Spec

**Status:** Approved
**Date:** 2026-05-15
**Audience:** engineers implementing this feature

---

## Goal

On the interview co-pilot page, give each `QuestionCard` a "Suggest follow-ups" button. When the interviewer clicks it (after writing a note about the candidate's answer), AI returns 2-3 follow-up questions tailored to what was said. Suggestions render below the note as a read-only list. Interviewer reads them and asks aloud — they are not stored, not turned into new question cards, and disappear on page reload.

---

## Architecture

One new stateless backend endpoint. One new AI service method. Frontend extends the existing `QuestionCard` with local-only state.

```
[interviewer writes a note for question N]
  ↓ clicks 💡 "Suggest follow-ups"
  ↓
POST /me/ai/suggest-follow-ups
  body: { questionText, note, topic, difficulty }
  ↓
liveInterviewAiService.suggestFollowUps()
  → aiService.askWithFallback(prompt, { json: true })
  ↓
returns { suggestions: ["...", "...", "..."] }
  ↓
[QuestionCard renders the list under the note with a ↻ Regenerate link]
```

**Why stateless:** The candidate note is debounced (1.2s) before flushing to the LiveSession. Having the client send `{ questionText, note }` in the request body avoids the race and keeps the endpoint simple — no DB lookup, no question-index ownership check needed.

---

## Backend

### New file

| File | Responsibility |
|---|---|
| (none) — extends existing `liveInterviewAiService.js` and `liveInterviewController.js` |  |

### Modified files

| File | Change |
|---|---|
| `backend/src/services/liveInterviewAiService.js` | Add `suggestFollowUps({ questionText, note, topic, difficulty })`. Builds a focused prompt, calls `aiService.askWithFallback(prompt)` (default JSON mode), parses, validates, returns `{ suggestions: string[] }`. |
| `backend/src/controllers/liveInterviewController.js` | Add `suggestFollowUps` handler — thin wrapper. |
| `backend/src/validators/liveInterviewValidator.js` | Add `suggestFollowUpsBody` Joi schema: `questionText` (string, 1-2000), `note` (string, 1-2000), `topic` (string, optional, ≤200), `difficulty` (enum optional). |
| `backend/src/routes/liveInterviewRoutes.js` | Add `POST /ai/suggest-follow-ups` under the existing `requireAuth + requireRole('interviewer')` block. Apply `aiLimiter` middleware (same rate limiter used by `start`). |

### Service Implementation Detail

**`suggestFollowUps({ questionText, note, topic, difficulty })`:**

```js
const buildFollowUpPrompt = ({ questionText, note, topic, difficulty }) => `You are helping an interviewer ask better follow-up questions during a live technical interview.

Question that was asked:
"""${questionText}"""

${topic ? `Topic: ${topic}\n` : ''}${difficulty ? `Difficulty: ${difficulty}\n` : ''}
Interviewer's note about the candidate's answer (paraphrased — may be incomplete):
"""${note}"""

Generate 2-3 follow-up questions that probe deeper into the candidate's answer.
- Stay on the same topic.
- Prefer concrete, specific questions over generic ones.
- Aim for questions that test depth of understanding, not memorization.
- Each follow-up should be one sentence.

Output ONLY valid JSON in this shape (no markdown, no commentary):
{ "suggestions": ["...", "...", "..."] }`;
```

- Call `aiService.askWithFallback(prompt)` (default `{ json: true }` is correct).
- Parse with `aiService.extractJson`.
- Validate: must be `{ suggestions: string[] }` with length 1-5. Trim each, drop empty, cap to 3.
- If AI returns no text → throw `ApiError.serviceUnavailable('AI could not generate suggestions', { code: 'E_AI_FAILED' })`.
- If AI returns invalid shape → throw `ApiError.serviceUnavailable('AI returned invalid suggestions', { code: 'E_AI_PARSE' })`.
- Otherwise return `{ suggestions, provider, model }`.

### Route

```js
router.post(
  '/ai/suggest-follow-ups',
  aiLimiter,
  validate(v.suggestFollowUpsBody),
  ctrl.suggestFollowUps,
);
```

### Tests (backend)

Add to `backend/tests/unit/liveInterviewAiService.test.js`:

- Happy path: `askWithFallback` mocked to return valid JSON → service returns `{ suggestions: [...] }` with up to 3 items.
- AI returns no text → throws 503 with code `E_AI_FAILED`.
- AI returns invalid JSON shape → throws 503 with code `E_AI_PARSE`.
- AI returns more than 3 suggestions → service caps to 3.
- AI returns suggestions with empty/whitespace strings → service drops them.

---

## Frontend

### Modified files

| File | Change |
|---|---|
| `frontend/src/api/liveInterviewApi.js` | Add `suggestFollowUps({ questionText, note, topic, difficulty })` → `POST /me/ai/suggest-follow-ups`. |
| `frontend/src/features/liveInterview/QuestionCard.jsx` | Add local `useState` for `suggestions`, `loading`, `error`. Add 💡 button between the note textarea and the rating row. Render suggestions list when present. |
| `frontend/src/features/liveInterview/QuestionCard.scss` | Add styles for the button + suggestions list. |

### UI layout

The button + suggestions block sits **between** the note textarea and the rating row.

```
[EASY] [Topic]            [Mark asked]
Question text…
┌────────────────────────────────────┐
│ Quick note about the answer…       │  ← existing textarea
└────────────────────────────────────┘
[💡 Suggest follow-ups]                ← NEW (disabled if note is empty)
  ┌── Follow-up suggestions ────┐
  • Follow-up 1                  │
  • Follow-up 2                  │
  • Follow-up 3                  │
  ↻ Regenerate                   │
  └───────────────────────────────┘    ← NEW (after click)
Rating: ★ ★ ★ ★ ★
```

### Component state

```jsx
const [suggestions, setSuggestions] = useState([]);
const [loading, setLoading] = useState(false);
const [error, setError] = useState('');
```

State is local to the `QuestionCard`. Not persisted to the LiveSession, not in Redux. Reload = gone. That's intentional — suggestions are a quick assist, not part of the review record.

### Behavior

- **Button is disabled** if `!question.note?.trim()` — nothing useful to follow up on yet.
- **Click** → set `loading=true`, clear `error`, call `liveInterviewApi.suggestFollowUps({...})`. On success, set `suggestions`. On error, set `error` to the API message.
- **While loading** — button shows a small spinner + "Generating…" label, is disabled.
- **Regenerate** — same call, clears existing suggestions first.
- **Error display** — small red one-liner below the button: "Couldn't generate suggestions — try again."

### Visual style

- Button matches existing `QuestionCard` aesthetic (ghost-style, small).
- Suggestions block: light gray background, indented bullet list, monospace numbers, soft border-left to indicate "AI" provenance.

---

## Out of Scope (YAGNI)

- Click-to-add as new question card (can revisit if interviewers want it).
- Coverage gap detection ("you haven't covered X yet").
- Auto-trigger after note typing (would burn AI credits, distract).
- Saving suggestions to the LiveSession.
- Showing AI provider/model attribution in the UI.
- "Copy suggestion to clipboard" buttons.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Note is empty | Button disabled — never makes the request. |
| AI providers both fail | 503 from server with `E_AI_FAILED` → toast / inline error: "Couldn't generate suggestions — try again." |
| AI returns invalid JSON | 503 with `E_AI_PARSE` → same inline error. |
| Rate-limited (aiLimiter) | 429 → inline error: "Too many requests — wait a moment." |
| Network failure | Inline error with retry option (just regenerate button). |
| Interviewer hits Regenerate while a call is in flight | Second click is a no-op (button disabled while `loading=true`). |

---

## Testing

### Backend — Jest
See "Tests" section under Backend. 5 unit tests on the service. No new route-level test (covered by existing auth/validation middleware tests + manual smoke).

### Frontend — Manual
1. Open co-pilot for a scheduled interview.
2. On any question card, confirm 💡 button is **disabled** when the note is empty.
3. Type a note → button enables. Click it.
4. Within ~3-5s, 2-3 follow-up questions render under the note.
5. Click ↻ Regenerate → suggestions clear, new ones render.
6. Force AI failure (temporarily clear both AI keys, restart backend, retry click) → see inline error.
7. Refresh the page → suggestions are gone (confirmed not persisted).

---

## Future Enhancements (separate work, not in this plan)

- "Coverage check" — periodic AI pass that lists topics not yet covered, given the JD.
- "Ask this" button to insert a suggestion as a new question card in the queue.
- Suggestion history per question (track which suggestions were actually asked).
- Inline highlighting in the suggestion text when it overlaps with another question's topic.
