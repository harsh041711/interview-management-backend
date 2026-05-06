import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams } from 'react-router-dom';
import Loader from '@/components/common/Loader';
import StatusBadge from '@/components/common/StatusBadge';
import Button from '@/components/common/Button';
import { formatScheduledAt } from '@/utils/datetime';
import { fetchInterviewDetails, resetInterviewView } from './interviewViewSlice';
import RescheduleRequestForm from './RescheduleRequestForm';
import './InterviewViewPage.scss';

export default function InterviewViewPage() {
  const dispatch = useDispatch();
  const { token } = useParams();
  const { details, viewerRole, loadStatus, loadError } = useSelector((s) => s.interviewView);
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    dispatch(resetInterviewView());
    if (token) dispatch(fetchInterviewDetails({ token }));
  }, [dispatch, token]);

  // Loading / idle
  if (loadStatus === 'idle' || loadStatus === 'loading') {
    return <Loader fullscreen message="Loading interview…" />;
  }

  // Error: locked (410)
  if (loadStatus === 'failed' && loadError?.status === 410) {
    return (
      <div className="iv-page">
        <div className="iv-page__card iv-page__card--locked fade-in">
          <div className="iv-page__lock-icon">&#128274;</div>
          <h1>This interview has ended</h1>
          <p className="iv-page__muted">
            This interview is <strong>{details?.status || 'no longer active'}</strong> and the link is now closed.
          </p>
          <p className="iv-page__muted">If you have questions, please contact the recruiter.</p>
        </div>
      </div>
    );
  }

  // Error: generic
  if (loadStatus === 'failed') {
    return (
      <div className="iv-page">
        <div className="iv-page__card fade-in">
          <h1>Link not valid</h1>
          <p className="iv-page__error">This interview link is invalid or has expired.</p>
          {loadError?.message && (
            <p className="iv-page__muted">{loadError.message}</p>
          )}
          <p className="iv-page__muted">Please contact the recruiter if you believe this is a mistake.</p>
        </div>
      </div>
    );
  }

  // Succeeded
  if (loadStatus !== 'succeeded' || !details) return null;

  const { schedule, candidate, interviewer, meetingUrl, status, notes, latestPendingReschedule, canRequestReschedule } = details;
  const isTerminal = status === 'completed' || status === 'cancelled';

  return (
    <div className="iv-page">
      {/* Hero card */}
      <div className="iv-page__card iv-page__card--hero fade-in">
        <div className="iv-page__status-row">
          <StatusBadge status={status} />
        </div>

        <h1 className="iv-page__time">{formatScheduledAt(schedule.scheduledAt)}</h1>
        <p className="iv-page__duration">{schedule.durationMinutes} minute interview</p>

        <div className="iv-page__parties">
          <div className="iv-page__party">
            <span className="iv-page__party-label">Candidate</span>
            <span className="iv-page__party-name">{candidate.name}</span>
            {candidate.email && (
              <span className="iv-page__party-sub">{candidate.email}</span>
            )}
          </div>
          <div className="iv-page__party-sep">with</div>
          <div className="iv-page__party">
            <span className="iv-page__party-label">Interviewer</span>
            <span className="iv-page__party-name">{interviewer.name}</span>
            {interviewer.expertise && interviewer.expertise.length > 0 && (
              <div className="iv-page__chips">
                {interviewer.expertise.map((e) => (
                  <span key={e} className="chip">{e}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {!isTerminal && meetingUrl && (
          <a
            className="iv-page__join-btn"
            href={meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button size="lg" fullWidth>
              Join meeting
            </Button>
          </a>
        )}
      </div>

      {/* HR notes — only shown to interviewer when notes exist */}
      {viewerRole === 'interviewer' && notes && (
        <div className="iv-page__card iv-page__card--notes fade-in">
          <h2 className="iv-page__section-title">From the recruiter</h2>
          <p className="iv-page__notes-body">{notes}</p>
        </div>
      )}

      {/* Reschedule section */}
      {latestPendingReschedule ? (
        <div className="iv-page__card iv-page__card--banner fade-in">
          <div className="iv-page__banner">
            <strong>Reschedule requested</strong> — proposed time:{' '}
            <strong>{formatScheduledAt(latestPendingReschedule.proposedAt)}</strong>.
            Awaiting HR review.
            {latestPendingReschedule.reason && (
              <p className="iv-page__banner-reason">
                Reason: {latestPendingReschedule.reason}
              </p>
            )}
          </div>
        </div>
      ) : (
        viewerRole === 'interviewer' && canRequestReschedule && !isTerminal && (
          <div className="iv-page__card fade-in">
            {!formOpen ? (
              <Button variant="secondary" onClick={() => setFormOpen(true)}>
                Request reschedule
              </Button>
            ) : (
              <RescheduleRequestForm
                token={token}
                onCancel={() => setFormOpen(false)}
              />
            )}
          </div>
        )
      )}
    </div>
  );
}
