import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import Button from '@/components/common/Button';
import Loader from '@/components/common/Loader';
import StatusBadge from '@/components/common/StatusBadge';
import { resetTest, validateToken } from './testSlice';
import './TestEntryPage.scss';

export default function TestEntryPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { token } = useParams();
  const { candidate, validateStatus, validateError } = useSelector((s) => s.test);

  useEffect(() => {
    dispatch(resetTest());
    if (token) dispatch(validateToken({ token }));
  }, [dispatch, token]);

  const onContinue = () => {
    if (!candidate) return;
    if (candidate.status === 'completed' || candidate.status === 'cheated' || candidate.status === 'expired') return;
    if (!candidate.photoUrl) navigate(`/test/${token}/photo`);
    else navigate(`/test/${token}/run`);
  };

  if (validateStatus === 'loading' || validateStatus === 'idle') return <Loader fullscreen message="Validating your test link…" />;

  if (validateStatus === 'failed') {
    return (
      <div className="test-entry">
        <div className="test-entry__card">
          <h1>Link not valid</h1>
          <p className="test-entry__error">{validateError || 'This link is invalid or has expired.'}</p>
          <p>If you believe this is a mistake, please contact the recruiter who shared the link.</p>
        </div>
      </div>
    );
  }

  const locked = candidate && ['completed', 'cheated', 'expired'].includes(candidate.status);

  return (
    <div className="test-entry">
      <div className="test-entry__card fade-in">
        <div className="test-entry__header">
          <h1>Welcome, {candidate.name}</h1>
          <StatusBadge status={candidate.status} />
        </div>
        <p className="test-entry__email">{candidate.email}</p>

        <div className="test-entry__chips">
          {(candidate.techStack || []).map((t) => <span key={t} className="chip">{t}</span>)}
        </div>

        <ul className="test-entry__rules">
          <li>📷 You will be asked to capture a photo before starting.</li>
          <li>⏱ The test runs for <strong>{candidate.durationMinutes} minutes</strong> once started.</li>
          <li>🚫 <strong>Switching tabs or leaving the window will auto-submit your test.</strong></li>
          <li>📨 Your results will be sent to the recruiter automatically on submission.</li>
        </ul>

        {locked ? (
          <div className="test-entry__locked">
            <p>This test session is <strong>{candidate.status.replace('_', ' ')}</strong> and cannot be retaken.</p>
          </div>
        ) : (
          <Button onClick={onContinue} fullWidth size="lg">
            {candidate.photoUrl ? 'Continue to test' : 'Continue to photo capture'}
          </Button>
        )}
      </div>
    </div>
  );
}
