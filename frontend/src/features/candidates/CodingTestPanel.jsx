import { useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import Button from '@/components/common/Button';
import Loader from '@/components/common/Loader';
import { useToast } from '@/components/common/Toast';
import { codingSubmissionApi } from '@/api/codingSubmissionApi';
import { candidateApi } from '@/api/candidateApi';
import { formatDate } from '@/utils/formatters';
import './CodingTestPanel.scss';

const MONACO_LANG = { js: 'javascript', python: 'python', php: 'php' };
const LANG_LABEL = { js: 'JavaScript', python: 'Python', php: 'PHP' };

const tabSwitchClass = (n) => {
  if (n === 0) return 'ct-panel__tabsw--green';
  if (n <= 5) return 'ct-panel__tabsw--amber';
  return 'ct-panel__tabsw--red';
};

const difficultyClass = (d) => `ct-panel__difficulty ct-panel__difficulty--${d || 'medium'}`;

export default function CodingTestPanel({ candidate, onRefresh }) {
  const { push } = useToast();
  const [submissions, setSubmissions] = useState(null);
  const [busy, setBusy] = useState(null);
  const [drafts, setDrafts] = useState({});

  const ct = candidate.codingTest;

  useEffect(() => {
    if (!ct?.submittedAt) return;
    codingSubmissionApi.listForCandidate(candidate.id)
      .then((res) => {
        setSubmissions(res.items);
        const init = {};
        res.items.forEach((s) => { init[s.id] = { rating: s.rating || 0, comment: s.reviewComment || '' }; });
        setDrafts(init);
      })
      .catch((err) => push({ type: 'error', message: err.response?.data?.message || 'Failed to load submissions' }));
  }, [ct?.submittedAt, candidate.id, push]);

  if (!ct) return null;

  if (!ct.submittedAt) {
    return (
      <div className="ct-panel">
        <div className="ct-panel__head">
          <div>
            <div className="ct-panel__title">Coding Test</div>
            <div className="ct-panel__meta">
              Sent {formatDate(ct.sentAt)} · {ct.problemCount} problem(s) · {ct.durationMinutes} min · awaiting candidate
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (submissions === null) return <Loader message="Loading submissions…" />;

  const allRated = submissions.every((s) => s.rating != null);

  const onRate = async (sub) => {
    const draft = drafts[sub.id];
    if (!draft?.rating) { push({ type: 'warn', message: 'Pick a star rating first' }); return; }
    setBusy(`rate-${sub.id}`);
    try {
      await codingSubmissionApi.rate(sub.id, { rating: draft.rating, reviewComment: draft.comment });
      push({ type: 'success', message: 'Rating saved' });
      const refreshed = await codingSubmissionApi.listForCandidate(candidate.id);
      setSubmissions(refreshed.items);
    } catch (err) {
      push({ type: 'error', message: err.response?.data?.message || 'Save failed' });
    } finally {
      setBusy(null);
    }
  };

  const onRerun = async (sub) => {
    setBusy(`rerun-${sub.id}`);
    try {
      await codingSubmissionApi.rerun(sub.id);
      push({ type: 'success', message: 'Re-ran tests' });
      const refreshed = await codingSubmissionApi.listForCandidate(candidate.id);
      setSubmissions(refreshed.items);
    } catch (err) {
      push({ type: 'error', message: err.response?.data?.message || 'Re-run failed' });
    } finally {
      setBusy(null);
    }
  };

  const onShortlist = async () => {
    if (!window.confirm('Shortlist this candidate? A shortlist email will be sent.')) return;
    setBusy('shortlist');
    try {
      await candidateApi.codingShortlist(candidate.id);
      push({ type: 'success', message: 'Shortlisted' });
      onRefresh?.();
    } catch (err) {
      push({ type: 'error', message: err.response?.data?.message || 'Shortlist failed' });
    } finally { setBusy(null); }
  };

  const onReject = async () => {
    if (!window.confirm('Reject this candidate? A rejection email will be sent.')) return;
    setBusy('reject');
    try {
      await candidateApi.codingReject(candidate.id);
      push({ type: 'success', message: 'Rejected' });
      onRefresh?.();
    } catch (err) {
      push({ type: 'error', message: err.response?.data?.message || 'Reject failed' });
    } finally { setBusy(null); }
  };

  const totalPassed = submissions.reduce((a, s) => a + (s.passedCount || 0), 0);
  const totalCases = submissions.reduce((a, s) => a + (s.totalCount || 0), 0);
  const passPct = totalCases > 0 ? Math.round((totalPassed / totalCases) * 100) : 0;
  const outcomeLabel = ct.outcome === 'shortlisted'
    ? 'Shortlisted'
    : ct.outcome === 'rejected'
      ? 'Rejected'
      : 'Pending review';

  return (
    <div className="ct-panel">
      <div className="ct-panel__summary">
        <div className="ct-panel__summary-row">
          <div>
            <div className="ct-panel__title">Coding Test Submission</div>
            <div className="ct-panel__meta">
              Sent {formatDate(ct.sentAt)} · Submitted {formatDate(ct.submittedAt)} · {submissions.length} problem(s)
            </div>
          </div>
          <span className={`ct-panel__outcome ct-panel__outcome--${ct.outcome || 'pending_review'}`}>
            {outcomeLabel}
          </span>
        </div>
        <div className="ct-panel__stats">
          <div className="ct-panel__stat">
            <div className="ct-panel__stat-label">Test cases</div>
            <div className="ct-panel__stat-value">
              <span className={passPct >= 80 ? 'is-good' : passPct >= 50 ? 'is-ok' : 'is-bad'}>
                {totalPassed}/{totalCases}
              </span>
              <span className="ct-panel__stat-sub">{passPct}% passed</span>
            </div>
          </div>
          <div className="ct-panel__stat">
            <div className="ct-panel__stat-label">Tab switches</div>
            <div className="ct-panel__stat-value">
              <span className={`ct-panel__tabsw ${tabSwitchClass(submissions[0]?.tabSwitches || 0)}`}>
                {submissions[0]?.tabSwitches || 0}
              </span>
            </div>
          </div>
          <div className="ct-panel__stat">
            <div className="ct-panel__stat-label">Languages</div>
            <div className="ct-panel__stat-value">
              {[...new Set(submissions.map((s) => LANG_LABEL[s.language]))].join(', ') || '—'}
            </div>
          </div>
        </div>
      </div>

      {submissions.map((sub, idx) => (
        <div key={sub.id} className="ct-panel__sub">
          <div className="ct-panel__sub-head">
            <div>
              <div className="ct-panel__sub-num">Problem {idx + 1} of {submissions.length}</div>
              <h3 className="ct-panel__sub-title">{sub.problem?.title || 'Problem'}</h3>
              <div className="ct-panel__sub-tags">
                {sub.problem?.difficulty && (
                  <span className={difficultyClass(sub.problem.difficulty)}>
                    {sub.problem.difficulty}
                  </span>
                )}
                <span className="ct-panel__lang-tag">{LANG_LABEL[sub.language]}</span>
                <span className={`ct-panel__pass-pill ${sub.passedCount === sub.totalCount ? 'is-pass' : sub.passedCount > 0 ? 'is-partial' : 'is-fail'}`}>
                  {sub.passedCount}/{sub.totalCount} passed
                </span>
              </div>
            </div>
            {sub.rating && (
              <div className="ct-panel__sub-rating">
                <span className="ct-panel__rating-stars">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <span key={n} className={n <= sub.rating ? 'is-on' : ''}>★</span>
                  ))}
                </span>
                <span className="ct-panel__rating-label">Rated</span>
              </div>
            )}
          </div>

          <div className="ct-panel__cases-title">Test cases</div>
          <div className="ct-panel__cases">
            {sub.runs.map((r, i) => (
              <div key={i} className={`ct-panel__case ${r.passed ? 'is-passed' : 'is-failed'}`}>
                <div className="ct-panel__case-num">
                  <span className={`ct-panel__case-icon ${r.passed ? 'is-passed' : 'is-failed'}`}>
                    {r.passed ? '✓' : '✗'}
                  </span>
                  <span>Case {i + 1}</span>
                </div>
                <div className="ct-panel__case-body">
                  <div className="ct-panel__case-row">
                    <span className="ct-panel__case-label">Input</span>
                    <pre className="ct-panel__case-value">{r.stdin || '(empty)'}</pre>
                  </div>
                  <div className="ct-panel__case-row">
                    <span className="ct-panel__case-label">Expected</span>
                    <pre className="ct-panel__case-value">{r.expectedStdout || '(empty)'}</pre>
                  </div>
                  <div className="ct-panel__case-row">
                    <span className="ct-panel__case-label">Got</span>
                    <pre className={`ct-panel__case-value ${r.passed ? '' : 'is-bad'}`}>
                      {r.actualStdout || '(empty)'}
                      {r.error ? ` ⚠ ${r.error}` : ''}
                    </pre>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="ct-panel__cases-title">Candidate code</div>
          <div className="ct-panel__code">
            <div className="ct-panel__code-bar">
              <span className="ct-panel__code-lang">{LANG_LABEL[sub.language]}</span>
              <span className="ct-panel__code-readonly">Read-only</span>
            </div>
            <Editor
              height="320px"
              theme="vs-dark"
              language={MONACO_LANG[sub.language]}
              value={sub.code}
              options={{
                readOnly: true,
                minimap: { enabled: false },
                fontSize: 13,
                automaticLayout: true,
                scrollBeyondLastLine: false,
                padding: { top: 12 },
              }}
            />
          </div>

          <div className="ct-panel__rate-box">
            <div className="ct-panel__rate-title">Rate this submission</div>
            <div className="ct-panel__rate">
              <div className="ct-panel__stars">
                {[1, 2, 3, 4, 5].map((n) => (
                  <span
                    key={n}
                    className={`ct-panel__star ${n <= (drafts[sub.id]?.rating || 0) ? 'is-on' : ''}`}
                    onClick={() => setDrafts((d) => ({ ...d, [sub.id]: { ...d[sub.id], rating: n } }))}
                    title={`${n} star${n > 1 ? 's' : ''}`}
                  >★</span>
                ))}
              </div>
              <textarea
                rows={2}
                className="ct-panel__comment"
                placeholder="Comment (optional) — what stood out about this submission?"
                value={drafts[sub.id]?.comment || ''}
                onChange={(e) => setDrafts((d) => ({ ...d, [sub.id]: { ...d[sub.id], comment: e.target.value } }))}
              />
              <div className="ct-panel__rate-buttons">
                <Button size="sm" variant="secondary" onClick={() => onRerun(sub)} loading={busy === `rerun-${sub.id}`}>↻ Re-run tests</Button>
                <Button size="sm" onClick={() => onRate(sub)} loading={busy === `rate-${sub.id}`}>Save rating</Button>
              </div>
            </div>
          </div>
        </div>
      ))}

      {(!ct.outcome || ct.outcome === 'pending_review') && (
        <div className="ct-panel__decision">
          <div className="ct-panel__decision-head">
            <div className="ct-panel__decision-title">Final decision</div>
            <div className="ct-panel__decision-sub">
              {allRated
                ? 'All submissions rated. Make the call:'
                : `Rate all ${submissions.length} submission${submissions.length > 1 ? 's' : ''} before deciding.`}
            </div>
          </div>
          <div className="ct-panel__actions">
            <Button onClick={onShortlist} loading={busy === 'shortlist'} disabled={!allRated}>
              ✓ Shortlist candidate
            </Button>
            <Button variant="secondary" onClick={onReject} loading={busy === 'reject'} disabled={!allRated}>
              ✗ Reject candidate
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
