import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Button from '@/components/common/Button';
import Loader from '@/components/common/Loader';
import EmptyState from '@/components/common/EmptyState';
import { useToast } from '@/components/common/Toast';
import { fetchMyInterview } from '@/features/myInterviews/myInterviewsSlice';
import {
  startLiveSession, fetchActiveLiveSession, patchLiveSession, endLiveSession,
  setQuestionField, clearSession,
} from './liveInterviewSlice';
import ContextPanel from './ContextPanel';
import QuestionCard from './QuestionCard';
import CoverageBar from './CoverageBar';
import './LiveInterviewPage.scss';

const DEBOUNCE_MS = 1200;

function Timer({ startedAt }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!startedAt) return null;
  const elapsedSec = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
  const ss = String(elapsedSec % 60).padStart(2, '0');
  return <span className="live__timer">⏱ {mm}:{ss}</span>;
}

export default function LiveInterviewPage() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { push } = useToast();
  const { session, status, error } = useSelector((s) => s.liveInterview);
  const { detail } = useSelector((s) => s.myInterviews);

  // Buffer of pending updates to debounce-flush. Keyed by `${index}:${field}` so
  // a rapid sequence on the same field collapses to the latest value.
  const pendingRef = useRef(new Map());
  const timerRef = useRef(null);
  const endingRef = useRef(false);

  // On mount: load interview details (for context panel) + start/resume session.
  useEffect(() => {
    dispatch(fetchMyInterview(id));
    (async () => {
      const a = await dispatch(fetchActiveLiveSession(id));
      if (fetchActiveLiveSession.fulfilled.match(a) && !a.payload) {
        // No active session → start one (idempotent server-side).
        await dispatch(startLiveSession(id));
      }
    })();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      dispatch(clearSession());
    };
  }, [id, dispatch]);

  const flushPending = async () => {
    if (!session || !pendingRef.current.size) return;
    // Aggregate by index → single update per question, latest field values win.
    const byIndex = new Map();
    for (const [key, value] of pendingRef.current) {
      const [iStr, field] = key.split(':');
      const index = Number(iStr);
      const cur = byIndex.get(index) || { index };
      cur[field] = value;
      byIndex.set(index, cur);
    }
    pendingRef.current.clear();
    const updates = Array.from(byIndex.values());
    await dispatch(patchLiveSession({ sessionId: session.id || session._id, questionUpdates: updates }));
  };

  const onFieldChange = (index, field, value) => {
    dispatch(setQuestionField({ index, field, value }));
    pendingRef.current.set(`${index}:${field}`, value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flushPending, DEBOUNCE_MS);
  };

  const onEnd = async () => {
    if (!session || endingRef.current) return;
    endingRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    await flushPending();
    const a = await dispatch(endLiveSession(session.id || session._id));
    if (endLiveSession.fulfilled.match(a)) {
      push({ type: 'success', message: 'Interview ended.' });
      // Signal the detail page to surface the "View interview notes" button.
      // No encoded JSON in the URL — the page fetches notes from the server.
      navigate(`/interviewer/interviews/${id}?copilot=1`);
    } else {
      endingRef.current = false; // allow retry on failure
      push({ type: 'error', message: a.payload?.message || 'Could not end the interview' });
    }
  };

  if (status === 'loading' || !session) return <Loader message="Preparing co-pilot…" />;
  if (status === 'failed') return <EmptyState title="Couldn't open the co-pilot" description={error || '—'} />;

  const interview = detail?.interview;
  const candidate = interview?.candidate;
  // The Interview model has no JD reference. JD context lives in the snapshot
  // captured during the candidate's resume screening.
  const jd = candidate?.screening?.jdSnapshot || null;
  const priorReviews = (detail?.reviewHistory || []).filter(Boolean);

  return (
    <div className="live">
      <header className="live__topbar">
        <Link to={`/interviewer/interviews/${id}`} className="live__back">← Back</Link>
        <div className="live__id">
          <strong>{candidate?.name || 'Candidate'}</strong>
          <span>{interview?.role || jd?.title || ''}</span>
        </div>
        <Timer startedAt={session.startedAt} />
        <Button onClick={onEnd} loading={status === 'ending'}>End interview</Button>
      </header>

      <div className="live__grid">
        <ContextPanel interview={interview} candidate={candidate} jd={jd} priorReviews={priorReviews} />
        <section className="live__queue">
          <CoverageBar questions={session.questions || []} />
          {(session.questions || []).length === 0 && (
            <>
              <EmptyState
                title="No questions generated"
                description="The AI didn't return any questions. Try regenerating, or end the interview and write the review manually."
              />
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
                <Button variant="secondary" onClick={() => dispatch(startLiveSession(id))}>
                  Regenerate questions
                </Button>
              </div>
            </>
          )}
          {(session.questions || []).map((q, i) => (
            <QuestionCard key={i} question={q} index={i} onChange={onFieldChange} />
          ))}
        </section>
      </div>
    </div>
  );
}
