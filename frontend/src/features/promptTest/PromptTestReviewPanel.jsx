import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Button from '@/components/common/Button';
import { fetchSubmissionForCandidate, reevaluate } from './promptTestSlice';
import { useToast } from '@/components/common/Toast';
import './PromptTestReviewPanel.scss';

export default function PromptTestReviewPanel({ candidateId }) {
  const dispatch = useDispatch();
  const { push } = useToast();
  const { adminSubmission } = useSelector((s) => s.promptTest);

  useEffect(() => { if (candidateId) dispatch(fetchSubmissionForCandidate(candidateId)); }, [candidateId, dispatch]);

  if (!adminSubmission) return null;
  const s = adminSubmission;
  const e = s.evaluation || {};
  const status = s.status;

  const onReeval = async () => {
    const a = await dispatch(reevaluate(candidateId));
    if (reevaluate.fulfilled.match(a)) push({ type: 'success', message: 'Re-evaluation queued' });
    else push({ type: 'error', message: a.payload?.message || 'Failed' });
  };

  return (
    <div className="prompt-review">
      <div className="prompt-review__head">
        <h3>Prompt Test</h3>
        <span className="prompt-review__total">Total: {e.totalScore ?? '—'} / 100</span>
      </div>
      <div className="prompt-review__meta">
        Problem: {s.promptProblem?.title} · Difficulty: {s.promptProblem?.difficulty} · Submitted: {s.submittedAt ? new Date(s.submittedAt).toLocaleString() : '—'}
      </div>

      {status === 'evaluating' && <div className="prompt-review__pending">Evaluating… give it a few seconds.</div>}
      {status === 'evaluation_failed' && (
        <div className="prompt-review__err">
          <span>Evaluation failed: {e.aiNotes}</span>
          <Button size="sm" variant="secondary" onClick={onReeval}>Retry</Button>
        </div>
      )}

      <section>
        <h4>Candidate's prompt</h4>
        <pre className="prompt-review__pre">{s.candidatePrompt || '—'}</pre>
      </section>

      {e.executionOutput && (
        <section>
          <h4>Execution output</h4>
          <pre className="prompt-review__pre">{e.executionOutput}</pre>
        </section>
      )}

      {e.rubricBreakdown && (
        <section>
          <h4>Rubric (prompt craft) — {e.rubricScore}/50</h4>
          <ul className="prompt-review__list">
            {e.rubricBreakdown.map((r, i) => (
              <li key={i}><strong>{r.criterion}</strong>: {r.score}/5 — {r.notes}</li>
            ))}
          </ul>
        </section>
      )}

      {e.outputBreakdown && (
        <section>
          <h4>Output — {e.outputScore}/50</h4>
          <ul className="prompt-review__list">
            {e.outputBreakdown.map((r, i) => (
              <li key={i}>{r.pass ? '✓' : '✗'} <strong>{r.criterion}</strong> — {r.notes}</li>
            ))}
          </ul>
        </section>
      )}

      {status === 'evaluated' && (
        <div className="prompt-review__actions">
          <Button size="sm" variant="secondary" onClick={onReeval}>Re-run evaluation</Button>
        </div>
      )}
    </div>
  );
}
