import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import Button from '@/components/common/Button';
import Loader from '@/components/common/Loader';
import EmptyState from '@/components/common/EmptyState';
import { useToast } from '@/components/common/Toast';
import { fetchTestByToken, runPreview, submitTest } from './promptTestSlice';
import './PromptTestPage.scss';

export default function PromptTestPage() {
  const { token } = useParams();
  const dispatch = useDispatch();
  const { push } = useToast();
  const { candidateView, candidateStatus, previewOutput, runsRemaining, submitStatus, error } =
    useSelector((s) => s.promptTest);
  const [prompt, setPrompt] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => { dispatch(fetchTestByToken(token)); }, [token, dispatch]);
  useEffect(() => { if (candidateView?.candidatePrompt) setPrompt(candidateView.candidatePrompt); }, [candidateView]);

  if (candidateStatus === 'loading') return <Loader message="Loading test…" />;
  if (candidateStatus === 'failed') return <EmptyState title="Could not load" description={error || '—'} />;
  if (!candidateView) return null;
  if (candidateView.submitted || submitted) {
    return (
      <div className="prompt-test prompt-test--done">
        <h2>Submitted</h2>
        <p>Thanks — your prompt test has been submitted. Your interviewer will review it.</p>
      </div>
    );
  }

  const onTryIt = async () => {
    if (!prompt.trim()) return push({ type: 'error', message: 'Write a prompt first' });
    const a = await dispatch(runPreview({ token, prompt }));
    if (!runPreview.fulfilled.match(a)) push({ type: 'error', message: a.payload?.message || 'Preview failed' });
  };

  const onSubmit = async () => {
    if (!prompt.trim()) return push({ type: 'error', message: 'Write a prompt first' });
    if (!window.confirm("Submit and finish? You can't change it after this.")) return;
    const a = await dispatch(submitTest({ token, prompt }));
    if (submitTest.fulfilled.match(a)) { setSubmitted(true); push({ type: 'success', message: 'Submitted' }); }
    else push({ type: 'error', message: a.payload?.message || 'Submit failed' });
  };

  return (
    <div className="prompt-test">
      <div className="prompt-test__head">
        <h2>{candidateView.title}</h2>
        <span className="prompt-test__duration">{candidateView.durationMinutes} min</span>
      </div>

      <section className="prompt-test__card">
        <h3>Scenario</h3>
        <p className="prompt-test__desc">{candidateView.description}</p>
        <h3>Sample input</h3>
        <pre className="prompt-test__sample">{candidateView.sampleInput}</pre>
      </section>

      <section className="prompt-test__card">
        <h3>Your prompt</h3>
        <textarea
          className="prompt-test__textarea"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={10}
          maxLength={8000}
          placeholder="Write the prompt you would send to an LLM for this task…"
        />
        <div className="prompt-test__actions">
          <Button variant="secondary" onClick={onTryIt} disabled={runsRemaining === 0}>
            ▶ Try it ({runsRemaining ?? 0} left)
          </Button>
          <Button variant="primary" onClick={onSubmit} loading={submitStatus === 'loading'}>
            Submit &amp; Finish
          </Button>
        </div>
      </section>

      {previewOutput && (
        <section className="prompt-test__card">
          <h3>Last preview output</h3>
          <pre className="prompt-test__output">{previewOutput}</pre>
        </section>
      )}
    </div>
  );
}
