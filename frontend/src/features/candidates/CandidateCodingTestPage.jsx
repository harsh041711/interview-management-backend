import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useParams } from 'react-router-dom';
import Loader from '@/components/common/Loader';
import EmptyState from '@/components/common/EmptyState';
import StatusBadge from '@/components/common/StatusBadge';
import { fetchCandidate } from './candidateSlice';
import CodingTestPanel from './CodingTestPanel';
import './CandidateCodingTestPage.scss';

export default function CandidateCodingTestPage() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const { current, currentStatus, error } = useSelector((s) => s.candidates);

  useEffect(() => {
    dispatch(fetchCandidate(id));
  }, [dispatch, id]);

  const refresh = () => dispatch(fetchCandidate(id));

  if (currentStatus === 'loading' && !current) {
    return <Loader message="Loading coding test…" />;
  }
  if (currentStatus === 'failed' || !current) {
    return (
      <div className="candidate-coding-test">
        <Link to={`/candidates/${id}`} className="candidate-coding-test__back">← Back to candidate</Link>
        <EmptyState title="Couldn't load candidate" description={error || 'Try again.'} />
      </div>
    );
  }

  const c = current;

  return (
    <div className="candidate-coding-test">
      <Link to={`/candidates/${c.id}`} className="candidate-coding-test__back">← Back to candidate</Link>

      <div className="candidate-coding-test__head">
        <div className="candidate-coding-test__identity">
          <div className="candidate-coding-test__avatar">
            {c.photoUrl ? <img src={c.photoUrl} alt="" /> : (c.name?.[0] || '?').toUpperCase()}
          </div>
          <div>
            <h1>{c.name}</h1>
            <div className="candidate-coding-test__email">{c.email}</div>
            <div className="candidate-coding-test__sub">Coding test review</div>
          </div>
        </div>
        <StatusBadge status={c.status} />
      </div>

      {!c.codingTest ? (
        <EmptyState
          title="No coding test"
          description="This candidate hasn't been sent a coding test yet."
        />
      ) : (
        <CodingTestPanel candidate={c} onRefresh={refresh} />
      )}
    </div>
  );
}
