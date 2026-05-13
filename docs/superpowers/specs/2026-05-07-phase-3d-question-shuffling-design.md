# Phase 3D — Question Shuffling Design

**Date:** 2026-05-07
**Status:** Approved (brainstorming complete)
**Scope:** Make Round 1 question selection vary across candidates with the same tech stack and experience, by adding an experience axis to filtering and biasing the sampler toward least-used questions. Independent of Phase 3A/3B/3C; can ship in parallel.

---

## 1. Goal

Today's `sampleForTest` randomly samples N questions from the pool that matches the candidate's tech stack. With small or medium banks, candidates with the same stack and experience can still see substantial overlap. We want:

- Filter the candidate pool by **experience level** (entry / mid / senior), so candidates get appropriately-difficult questions.
- Bias selection toward questions that have been used least often, so high-volume same-profile candidates don't see identical sets.
- Track per-question usage so the bias is data-driven, not stateless.

Out of scope: tracking which specific candidate got which questions (would be the "Strategy 3" we considered and deferred).

---

## 2. Architecture Summary

- Add `experience` to **Candidate** (entry/mid/senior, required) and **Question** (entry/mid/senior/any, default `any`).
- Add `timesUsed` (Number, default 0) to **Question**.
- Modify the sampler in `questionRepository.sampleForTest` to:
  1. Filter by tech stack (existing case-insensitive logic).
  2. Filter by experience: `{ experience: { $in: [candidate.experience, 'any'] } }`.
  3. Sort the matching pool by `timesUsed` ascending, then random tiebreak.
  4. Return the top N.
  5. Atomically `$inc timesUsed` by 1 on the returned questions.

This is a least-used-first weighted sampler with no per-candidate tracking. It distributes load across the pool naturally over time.

---

## 3. Data Model Changes

### 3.1 `Candidate`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `experience` | enum: `entry` \| `mid` \| `senior` | yes (going forward) | none | Backfilled to `mid` on existing rows. |

### 3.2 `Question`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `experience` | enum: `entry` \| `mid` \| `senior` \| `any` | no | `any` | `any` matches any candidate's experience. |
| `timesUsed` | Number | no | 0 | Atomically incremented when sampled. |

Index on `{ techStack: 1, experience: 1, timesUsed: 1 }` to support the sampler's sort efficiently.

### 3.3 Migration

```js
db.candidates.updateMany({ experience: { $in: [null, undefined] } }, { $set: { experience: 'mid' } });
db.questions.updateMany({ experience: { $in: [null, undefined] } }, { $set: { experience: 'any' } });
db.questions.updateMany({ timesUsed: { $in: [null, undefined] } }, { $set: { timesUsed: 0 } });
```

Run as part of the Phase 3 migration script (shared with the main Phase 3 spec).

---

## 4. Sampler Algorithm

### 4.1 Pseudocode

```js
async function sampleForTest({ techStack, experience, count }) {
  const techRegex = new RegExp(`^${escapeRegex(techStack)}$`, 'i');
  const filter = {
    techStack: techRegex,
    experience: { $in: [experience, 'any'] },
  };

  // Pull candidate pool sorted by least-used, then random tiebreak via $sample after slicing
  const pool = await Question.aggregate([
    { $match: filter },
    { $sort: { timesUsed: 1, _id: 1 } },              // least-used first, stable tiebreak
    { $limit: Math.max(count * 3, count + 5) },        // take a generous head slice
    { $sample: { size: count } },                      // shuffle within the head
  ]);

  if (pool.length < count) {
    throw NotEnoughQuestionsError({ techStack, experience, requested: count, available: pool.length });
  }

  const ids = pool.map((q) => q._id);
  await Question.updateMany({ _id: { $in: ids } }, { $inc: { timesUsed: 1 } });

  return pool;
}
```

### 4.2 Why "head slice + $sample" instead of pure sort + slice

Pure sort + slice would deterministically return the same N questions every time the bank size is large (the lowest-used ones). The head-slice + `$sample` approach:

- Constrains the lottery to the **least-used** segment of the pool (so high-use questions don't sneak in unless the pool is small),
- Randomizes within that segment so two consecutive same-profile candidates rarely get the identical set,
- Naturally rebalances over time as `timesUsed` climbs and the head slice shifts.

The factor of 3 (`count * 3`) is a tunable. With `count=10` and a pool of 50 questions of equal `timesUsed`, we'd sample from the 30 with lowest `timesUsed` — comfortably random per candidate.

### 4.3 Edge cases

| Case | Behavior |
|---|---|
| Pool smaller than `count` | Throw `E_NOT_ENOUGH_QUESTIONS` with technologies + experience in the error payload, so HR knows which bank is short. UI surfaces a friendly message at candidate-create time. |
| Candidate `experience=null` (legacy not migrated) | Repository falls back to `experience='mid'` for sampling. Migration script should make this rare. |
| All questions in pool have `timesUsed=0` (fresh bank) | Head slice is the entire matching pool; `$sample` randomizes uniformly — equivalent to today's behavior. |
| Concurrent sampling for two candidates at once | The `$inc` is atomic per document, but the read-then-write isn't. Two simultaneous samplers may pick overlapping sets. Acceptable: the bias still works in aggregate; we are not promising strict no-overlap. |

---

## 5. API Changes

- `POST /candidates` and `PATCH /candidates/:id` — accept and require `experience`.
- `POST /questions` and `PATCH /questions/:id` — accept `experience` (default `any`).
- `GET /questions?experience=…` — optional filter for the question-management list.
- `GET /questions/tech-stacks` — unchanged shape; backend still derives the distinct list from the bank.

No new endpoints. The sampler change is internal to `testService.startTest`.

---

## 6. Frontend Changes

- **Candidate create modal** — add experience radio (entry/mid/senior) below tech stack. Required.
- **Candidate list** — new column "Experience" with a small badge.
- **Candidate filters** — optional experience filter dropdown (mirrors the tech-stack filter).
- **Question form** — add experience selector (entry/mid/senior/any). Default "any."
- **Question list** — show experience as a chip; show `timesUsed` as a subdued numeric.
- **Question filters** — optional experience filter.

No new layouts, slices, or routes.

---

## 7. Out of Scope

- **Per-candidate question history.** We do not store which questions were given to which candidate. If a candidate retakes a regenerated test, they may overlap with their previous attempt.
- **Strict no-overlap guarantee.** This design biases toward variety; it does not promise zero overlap, especially under tight pools or concurrent sampling.
- **Per-experience minimum-bank-size enforcement at sample time beyond the existing "not enough questions" error.** HR is expected to keep the bank stocked.

---

## 8. Open Items

None.
