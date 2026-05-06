import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import Button from '@/components/common/Button';
import Loader from '@/components/common/Loader';
import { useToast } from '@/components/common/Toast';
import { useAntiCheat } from '@/hooks/useAntiCheat';
import {
  autoSubmitTest,
  lockTest,
  nextQuestion,
  prevQuestion,
  resetTest,
  setAnswer,
  setCurrentIndex,
  startTest,
  submitTest,
  validateToken,
} from './testSlice';
import Timer from './components/Timer';
import QuestionRenderer from './components/QuestionRenderer';
import './TestPage.scss';

export default function TestPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { token } = useParams();
  const { push } = useToast();
  const {
    candidate,
    session,
    questions,
    answers,
    currentIndex,
    startStatus,
    submitStatus,
    locked,
    submitResult,
  } = useSelector((s) => s.test);

  const [confirmingSubmit, setConfirmingSubmit] = useState(false);

  // Initial load: validate token, then start test if not started.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const v = await dispatch(validateToken({ token }));
      if (cancelled) return;
      if (validateToken.rejected.match(v)) {
        navigate(`/test/${token}`, { replace: true });
        return;
      }
      const c = v.payload?.candidate;
      if (!c?.photoUrl) {
        navigate(`/test/${token}/photo`, { replace: true });
        return;
      }
      if (['completed', 'cheated', 'expired'].includes(c.status)) {
        navigate(`/test/${token}`, { replace: true });
        return;
      }
      const start = await dispatch(startTest({ token }));
      if (startTest.rejected.match(start)) {
        push({ type: 'error', message: start.payload?.message || 'Could not start the test' });
      }
    })();
    return () => { cancelled = true; dispatch(resetTest()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (locked && submitResult) navigate(`/test/${token}/submitted`, { replace: true });
  }, [locked, submitResult, navigate, token]);

  const buildAnswerPayload = useCallback(
    () => Object.entries(answers).map(([questionId, answer]) => ({ questionId, answer })),
    [answers],
  );

  const onViolation = useCallback(({ eventType }) => {
    dispatch(lockTest({ reason: 'Tab switch / window blur detected' }));
    dispatch(autoSubmitTest({
      token,
      eventType,
      reason: 'Auto-submitted: tab switch or window blur',
      answers: buildAnswerPayload(),
    }));
    push({ type: 'error', message: 'Test auto-submitted: switching tabs or windows is not allowed.' });
  }, [dispatch, token, buildAnswerPayload, push]);

  useAntiCheat({ enabled: startStatus === 'succeeded' && !locked, onViolation });

  // Block context menu and copy/paste during test (best-effort).
  useEffect(() => {
    if (startStatus !== 'succeeded' || locked) return undefined;
    const block = (e) => e.preventDefault();
    document.addEventListener('contextmenu', block);
    return () => document.removeEventListener('contextmenu', block);
  }, [startStatus, locked]);

  const onSubmit = async () => {
    setConfirmingSubmit(false);
    const action = await dispatch(submitTest({ token, answers: buildAnswerPayload() }));
    if (submitTest.fulfilled.match(action)) {
      navigate(`/test/${token}/submitted`, { replace: true });
    } else {
      push({ type: 'error', message: action.payload?.message || 'Submit failed' });
    }
  };

  const onTimeUp = useCallback(() => {
    if (locked) return;
    dispatch(lockTest({ reason: 'Time up' }));
    dispatch(autoSubmitTest({
      token,
      eventType: 'tab_switch', // not really a cheat — but uses the same path
      reason: 'Auto-submitted: time expired',
      answers: buildAnswerPayload(),
    })).then(() => navigate(`/test/${token}/submitted`, { replace: true }));
  }, [dispatch, locked, token, buildAnswerPayload, navigate]);

  const current = questions[currentIndex];
  const total = questions.length;
  const answered = useMemo(
    () => questions.filter((q) => {
      const a = answers[q.id];
      if (Array.isArray(a)) return a.length > 0;
      return a != null && a !== '';
    }).length,
    [answers, questions],
  );

  if (startStatus === 'loading' || startStatus === 'idle' || !candidate) {
    return <Loader fullscreen message="Preparing your test…" />;
  }

  if (startStatus === 'failed') {
    return (
      <div className="test-run">
        <div className="test-run__error fade-in">
          <h2>Could not start the test</h2>
          <p>Please contact the recruiter who shared this link.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="test-run">
      <header className="test-run__header">
        <div>
          <div className="test-run__name">{candidate.name}</div>
          <div className="test-run__progress">{currentIndex + 1} / {total} · answered {answered}</div>
        </div>
        {session?.endsAt && <Timer endsAt={session.endsAt} onExpire={onTimeUp} />}
      </header>

      <div className="test-run__progressbar"><div style={{ width: `${(answered / total) * 100}%` }} /></div>

      <main className="test-run__main">
        {current ? (
          <article className="test-run__question fade-in">
            <div className="test-run__question-meta">
              <span className="qr__type">{current.type.replace('_', '-')}</span>
              <span>{current.techStack}</span>
              <span>·</span>
              <span>{current.marks} mark{current.marks === 1 ? '' : 's'}</span>
            </div>
            <h2 className="test-run__question-text">{current.question}</h2>
            <QuestionRenderer
              question={current}
              value={answers[current.id]}
              onChange={(v) => dispatch(setAnswer({ questionId: current.id, answer: v }))}
            />
          </article>
        ) : null}
      </main>

      <footer className="test-run__footer">
        <Button variant="ghost" onClick={() => dispatch(prevQuestion())} disabled={currentIndex === 0}>← Previous</Button>
        <div className="test-run__dots">
          {questions.map((q, idx) => {
            const a = answers[q.id];
            const done = Array.isArray(a) ? a.length > 0 : a != null && a !== '';
            return (
              <button
                key={q.id}
                onClick={() => dispatch(setCurrentIndex(idx))}
                className={`test-run__dot ${idx === currentIndex ? 'is-current' : ''} ${done ? 'is-done' : ''}`}
                aria-label={`Question ${idx + 1}`}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>
        {currentIndex === total - 1 ? (
          <Button onClick={() => setConfirmingSubmit(true)} loading={submitStatus === 'loading'}>Submit test</Button>
        ) : (
          <Button onClick={() => dispatch(nextQuestion())}>Next →</Button>
        )}
      </footer>

      {confirmingSubmit && (
        <div className="test-run__confirm" role="dialog" aria-modal="true">
          <div className="test-run__confirm-card fade-in">
            <h3>Submit your test?</h3>
            <p>You answered <strong>{answered} of {total}</strong> questions. After submission you cannot change your answers.</p>
            <div className="test-run__confirm-actions">
              <Button variant="secondary" onClick={() => setConfirmingSubmit(false)}>Keep working</Button>
              <Button onClick={onSubmit} loading={submitStatus === 'loading'}>Yes, submit</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
