import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import Button from '@/components/common/Button';
import Loader from '@/components/common/Loader';
import EmptyState from '@/components/common/EmptyState';
import { useToast } from '@/components/common/Toast';
import { fetchTestByToken, runPreview, submitTest } from './promptTestSlice';
import './PromptTestPage.scss';

const MAX_PROMPT_CHARS = 8000;

const formatMmSs = (ms) => {
  if (ms <= 0) return '00:00';
  const totalSec = Math.floor(ms / 1000);
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  return `${mm}:${ss}`;
};

function CountdownTimer({ expiresAt }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const target = useMemo(() => (expiresAt ? new Date(expiresAt).getTime() : 0), [expiresAt]);
  const remaining = Math.max(0, target - now);
  const urgent = remaining > 0 && remaining < 5 * 60 * 1000;
  const expired = remaining === 0 && target > 0;
  return (
    <span className={`prompt-test__timer ${urgent ? 'prompt-test__timer--urgent' : ''} ${expired ? 'prompt-test__timer--expired' : ''}`}>
      <span className="prompt-test__timer-icon" aria-hidden>🕐</span>
      <span>{formatMmSs(remaining)}</span>
    </span>
  );
}

export default function PromptTestPage() {
  const { token } = useParams();
  const dispatch = useDispatch();
  const { push } = useToast();
  const { candidateView, candidateStatus, previewOutput, runsRemaining, submitStatus, error } =
    useSelector((s) => s.promptTest);
  const [prompt, setPrompt] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => { dispatch(fetchTestByToken(token)); }, [token, dispatch]);
  useEffect(() => { if (candidateView?.candidatePrompt) setPrompt(candidateView.candidatePrompt); }, [candidateView]);

  if (candidateStatus === 'loading') return <Loader message="Loading your test…" />;
  if (candidateStatus === 'failed') return <EmptyState title="Could not load" description={error || '—'} />;
  if (!candidateView) return null;
  if (candidateView.submitted || submitted) {
    return (
      <div className="prompt-test prompt-test--done">
        <div className="prompt-test__done-card">
          <div className="prompt-test__done-check" aria-hidden>✓</div>
          <h2>All set</h2>
          <p>Your prompt has been submitted. The interviewer will review it shortly — you can close this tab.</p>
        </div>
      </div>
    );
  }

  const onTryIt = async () => {
    if (!prompt.trim()) return push({ type: 'error', message: 'Write a prompt first' });
    setPreviewing(true);
    const a = await dispatch(runPreview({ token, prompt }));
    setPreviewing(false);
    if (!runPreview.fulfilled.match(a)) push({ type: 'error', message: a.payload?.message || 'Preview failed' });
  };

  const onSubmit = async () => {
    if (!prompt.trim()) return push({ type: 'error', message: 'Write a prompt first' });
    if (!window.confirm("Submit and finish? You can't change it after this.")) return;
    const a = await dispatch(submitTest({ token, prompt }));
    if (submitTest.fulfilled.match(a)) {
      setSubmitted(true);
      push({ type: 'success', message: 'Submitted' });
    } else {
      push({ type: 'error', message: a.payload?.message || 'Submit failed' });
    }
  };

  const remaining = typeof runsRemaining === 'number' ? runsRemaining : candidateView.previewRunsRemaining ?? 0;
  const charCount = prompt.length;

  return (
    <div className="prompt-test">
      <header className="prompt-test__topbar">
        <div className="prompt-test__brand">
          <div className="prompt-test__brand-mark" aria-hidden>IM</div>
          <div>
            <div className="prompt-test__brand-name">Interview Mgmt</div>
            <div className="prompt-test__brand-sub">Candidate portal</div>
          </div>
        </div>
        <div className="prompt-test__topbar-center">
          <div className="prompt-test__candidate">{candidateView.candidateName || 'Candidate'}</div>
          <div className="prompt-test__test-label">Prompt Engineering Test</div>
        </div>
        <CountdownTimer expiresAt={candidateView.expiresAt} />
      </header>

      <main className="prompt-test__main">
        <div className="prompt-test__grid">
          {/* LEFT — problem statement + tips */}
          <div className="prompt-test__left">
            <section className="prompt-test__card prompt-test__card--accent">
              <div className="prompt-test__chips">
                {candidateView.difficulty && (
                  <span className={`prompt-test__chip prompt-test__chip--${candidateView.difficulty}`}>
                    {candidateView.difficulty}
                  </span>
                )}
                {(candidateView.tags || []).map((t) => (
                  <span key={t} className="prompt-test__chip prompt-test__chip--tag">{t}</span>
                ))}
                <span className="prompt-test__chip prompt-test__chip--duration">
                  {candidateView.durationMinutes} min
                </span>
              </div>

              <h1 className="prompt-test__title">{candidateView.title}</h1>

              <div className="prompt-test__section">
                <div className="prompt-test__section-label">Scenario</div>
                <p className="prompt-test__desc">{candidateView.description}</p>
              </div>

              <div className="prompt-test__section">
                <div className="prompt-test__section-label">
                  Sample input <span className="prompt-test__section-hint">— the LLM will receive this</span>
                </div>
                <pre className="prompt-test__sample">{candidateView.sampleInput}</pre>
              </div>
            </section>

            <section className="prompt-test__card prompt-test__card--tips">
              <div className="prompt-test__tips-title">
                <span aria-hidden>💡</span> Tips for a strong prompt
              </div>
              <ul className="prompt-test__tips-list">
                <li>Give the LLM a clear role and context.</li>
                <li>Specify the exact output format you want (JSON shape, field names, length).</li>
                <li>Include constraints, examples, or edge-cases the LLM should handle.</li>
                <li>Iterate — click <strong>Try it</strong> to see what your prompt actually produces.</li>
              </ul>
            </section>
          </div>

          {/* RIGHT — editor + output */}
          <div className="prompt-test__right">
            <section className="prompt-test__card prompt-test__card--editor">
              <div className="prompt-test__card-head">
                <div className="prompt-test__section-label">Your prompt</div>
                <div className={`prompt-test__charcount ${charCount > MAX_PROMPT_CHARS * 0.9 ? 'prompt-test__charcount--warn' : ''}`}>
                  {charCount.toLocaleString()} / {MAX_PROMPT_CHARS.toLocaleString()}
                </div>
              </div>
              <textarea
                className="prompt-test__textarea"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value.slice(0, MAX_PROMPT_CHARS))}
                maxLength={MAX_PROMPT_CHARS}
                placeholder={`You are a senior backend engineer. When given a task description below, produce…

Write the instruction prompt you would send to an LLM so that, when applied to the sample input on the left, it produces a complete, well-structured response.`}
              />
              <div className="prompt-test__actions">
                <span className="prompt-test__runs-pill">
                  ▶ {remaining} preview {remaining === 1 ? 'run' : 'runs'} left
                </span>
                <div className="prompt-test__actions-spacer" />
                <Button
                  variant="secondary"
                  onClick={onTryIt}
                  disabled={remaining === 0 || previewing}
                  loading={previewing}
                >
                  Try it
                </Button>
                <Button
                  variant="primary"
                  onClick={onSubmit}
                  loading={submitStatus === 'loading'}
                  disabled={previewing || submitStatus === 'loading'}
                >
                  Submit &amp; Finish
                </Button>
              </div>
            </section>

            <section className="prompt-test__card">
              <div className="prompt-test__section-label">
                LLM output <span className="prompt-test__section-hint">— what your prompt produced</span>
              </div>
              {previewing ? (
                <div className="prompt-test__output-pending">
                  <span className="prompt-test__spinner" aria-hidden />
                  Running your prompt through the LLM…
                </div>
              ) : previewOutput ? (
                <pre className="prompt-test__output">{previewOutput}</pre>
              ) : (
                <div className="prompt-test__output-empty">
                  Click <strong>Try it</strong> to see what your prompt produces against the sample input.
                  <br />
                  You have <strong>{remaining}</strong> preview {remaining === 1 ? 'run' : 'runs'} before submission.
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
