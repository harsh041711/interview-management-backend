import { useSelector } from 'react-redux';
import './SubmittedPage.scss';

export default function SubmittedPage() {
  const { candidate, submitResult, lockedReason } = useSelector((s) => s.test);
  const cheat = submitResult?.cheatDetected;

  return (
    <div className="submitted">
      <div className="submitted__card fade-in">
        <div className={`submitted__icon ${cheat ? 'is-bad' : 'is-good'}`}>
          {cheat ? '⚠' : '✓'}
        </div>
        <h1>{cheat ? 'Test auto-submitted' : 'Test submitted'}</h1>
        <p>
          {cheat
            ? `Your test was automatically submitted because of a violation: ${lockedReason || 'tab switch / window blur'}.`
            : `Thanks ${candidate?.name?.split(' ')[0] || ''}, your responses have been recorded.`}
        </p>
        <p className="submitted__sub">
          A detailed report has been sent to the recruiter. You may close this tab.
        </p>
      </div>
    </div>
  );
}
