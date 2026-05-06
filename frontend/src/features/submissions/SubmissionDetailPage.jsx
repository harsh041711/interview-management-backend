import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useParams } from 'react-router-dom';
import Loader from '@/components/common/Loader';
import StatusBadge from '@/components/common/StatusBadge';
import EmptyState from '@/components/common/EmptyState';
import { fetchSubmission } from './submissionSlice';
import { formatDate } from '@/utils/formatters';
import './SubmissionDetailPage.scss';

const TYPE_LABEL = {
  mcq: 'MCQ',
  multi_select: 'Multi-select',
  one_line: 'One-line',
  descriptive: 'Descriptive',
};

const renderGiven = (given, type) => {
  if (given == null || given === '') return <em>No answer</em>;
  if (Array.isArray(given)) return given.join(', ');
  if (type === 'descriptive') return <pre className="submission-detail__pre">{given}</pre>;
  return given;
};

const renderExpected = (q) => {
  if (q.type === 'multi_select') return Array.isArray(q.correctAnswer) ? q.correctAnswer.join(', ') : '—';
  if (q.type === 'descriptive') return <em>AI-graded</em>;
  return q.correctAnswer || '—';
};

export default function SubmissionDetailPage() {
  const dispatch = useDispatch();
  const { id } = useParams();
  const { selected, detailStatus, error } = useSelector((s) => s.submissions);

  useEffect(() => { dispatch(fetchSubmission(id)); }, [dispatch, id]);

  if (detailStatus === 'loading' || !selected) return <Loader message="Loading submission…" />;
  if (error) return <EmptyState title="Failed to load" description={error} />;

  const c = selected.candidate || {};
  return (
    <div className="submission-detail">
      <Link to="/submissions" className="submission-detail__back">← Back to submissions</Link>

      <header className="submission-detail__head">
        <div className="submission-detail__candidate">
          {c.photoUrl
            ? <img src={c.photoUrl} alt="" />
            : <span className="submission-detail__avatar">{c.name?.[0] || '?'}</span>}
          <div>
            <h1>{c.name}</h1>
            <div className="submission-detail__email">{c.email}</div>
            <div className="submission-detail__chips">
              {(c.techStack || []).map((t) => <span key={t} className="chip">{t}</span>)}
            </div>
          </div>
        </div>
        <div className="submission-detail__score">
          <div className="submission-detail__pct">{selected.percentage}%</div>
          <div className="submission-detail__total">{selected.totalScore} / {selected.maxScore}</div>
          <StatusBadge status={selected.cheatDetected ? 'cheated' : selected.autoSubmitted ? 'auto_submitted' : 'submitted'} />
        </div>
      </header>

      {selected.cheatDetected && (
        <div className="submission-detail__warning">
          <strong>⚠ Cheat detected:</strong> {selected.cheatReason || 'tab switch / window blur during test'}
        </div>
      )}

      <div className="submission-detail__meta">
        <div><strong>Submitted:</strong> {formatDate(selected.submittedAt)}</div>
        <div><strong>Auto-submitted:</strong> {selected.autoSubmitted ? 'Yes' : 'No'}</div>
        <div>
          <strong>Report email:</strong>{' '}
          {selected.reportEmailedAt
            ? `Sent ${formatDate(selected.reportEmailedAt)}`
            : selected.reportEmailError
              ? <span className="submission-detail__email-error">Failed: {selected.reportEmailError}</span>
              : 'Pending'}
        </div>
        <div>
          <strong>Round 1 outcome:</strong>{' '}
          {selected.round1Outcome ? <StatusBadge status={selected.round1Outcome} /> : '—'}
        </div>
        <div>
          <strong>Result email:</strong>{' '}
          {selected.round1ResultEmailedAt
            ? `Sent ${formatDate(selected.round1ResultEmailedAt)}`
            : selected.round1ResultEmailError
              ? <span className="submission-detail__email-error">Failed: {selected.round1ResultEmailError}</span>
              : 'Pending'}
        </div>
      </div>

      <h3>Answer breakdown</h3>
      <ol className="submission-detail__answers">
        {(selected.answers || []).map((a, idx) => {
          const q = a.question || {};
          const correct = a.isCorrect;
          return (
            <li key={idx} className={`answer-card ${correct ? 'is-correct' : 'is-wrong'}`}>
              <div className="answer-card__head">
                <span className="answer-card__index">{idx + 1}.</span>
                <span className="answer-card__type">{TYPE_LABEL[q.type] || q.type}</span>
                <span className="chip">{q.techStack}</span>
                <span className={`answer-card__verdict ${correct ? 'is-ok' : 'is-bad'}`}>
                  {correct ? 'Correct' : 'Incorrect'} · {a.score}/{a.maxScore}
                </span>
              </div>
              <p className="answer-card__q">{q.question}</p>
              <div className="answer-card__row"><strong>Candidate:</strong> {renderGiven(a.given, q.type)}</div>
              <div className="answer-card__row"><strong>Expected:</strong> {renderExpected(q)}</div>
              {a.aiFeedback && (
                <div className="answer-card__ai">
                  <strong>AI feedback ({a.aiProvider || 'n/a'}):</strong> {a.aiFeedback}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
