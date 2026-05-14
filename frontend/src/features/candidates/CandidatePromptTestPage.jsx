import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useParams } from 'react-router-dom';
import Loader from '@/components/common/Loader';
import EmptyState from '@/components/common/EmptyState';
import StatusBadge from '@/components/common/StatusBadge';
import { fetchCandidate } from './candidateSlice';
import PromptTestReviewPanel from '@/features/promptTest/PromptTestReviewPanel';
import './CandidatePromptTestPage.scss';

export default function CandidatePromptTestPage() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const { current, currentStatus, error } = useSelector((s) => s.candidates);

  useEffect(() => {
    dispatch(fetchCandidate(id));
  }, [dispatch, id]);

  if (currentStatus === 'loading' && !current) {
    return <Loader message="Loading prompt test…" />;
  }
  if (currentStatus === 'failed' || !current) {
    return (
      <div className="candidate-prompt-test">
        <Link to={`/candidates/${id}`} className="candidate-prompt-test__back">← Back to candidate</Link>
        <EmptyState title="Couldn't load candidate" description={error || 'Try again.'} />
      </div>
    );
  }

  const c = current;

  return (
    <div className="candidate-prompt-test">
      <Link to={`/candidates/${c.id}`} className="candidate-prompt-test__back">← Back to candidate</Link>

      <div className="candidate-prompt-test__head">
        <div className="candidate-prompt-test__identity">
          <div className="candidate-prompt-test__avatar">
            {c.photoUrl ? <img src={c.photoUrl} alt="" /> : (c.name?.[0] || '?').toUpperCase()}
          </div>
          <div>
            <h1>{c.name}</h1>
            <div className="candidate-prompt-test__email">{c.email}</div>
            <div className="candidate-prompt-test__sub">Prompt test review</div>
          </div>
        </div>
        <StatusBadge status={c.status} />
      </div>

      {!c.promptTest ? (
        <EmptyState
          title="No prompt test"
          description="This candidate hasn't been assigned a prompt test yet."
        />
      ) : (
        <PromptTestReviewPanel candidateId={c.id} />
      )}
    </div>
  );
}
