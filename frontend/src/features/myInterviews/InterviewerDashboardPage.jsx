import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import Loader from '@/components/common/Loader';
import EmptyState from '@/components/common/EmptyState';
import StatusBadge from '@/components/common/StatusBadge';
import { formatDate } from '@/utils/formatters';
import { fetchMyInterviews } from './myInterviewsSlice';
import './InterviewerDashboardPage.scss';

const reviewBadge = (row) => {
  if (row.reviewSubmitted) return <span className="i-card__pill i-card__pill--ok">Reviewed</span>;
  if (row.pendingEditRequest) return <span className="i-card__pill i-card__pill--warn">Edit pending</span>;
  return <span className="i-card__pill i-card__pill--todo">Pending review</span>;
};

const InterviewCard = ({ interview, ctaLabel, ctaTo, badge }) => (
  <Link to={ctaTo} className="i-card">
    <div className="i-card__head">
      <div className="i-card__name">{interview.candidate?.name || '—'}</div>
      {badge}
    </div>
    <div className="i-card__meta">
      <span>{formatDate(interview.scheduledAt)}</span>
      <span>·</span>
      <span>{interview.durationMinutes} min</span>
      <span>·</span>
      <StatusBadge status={interview.status} />
    </div>
    <div className="i-card__cta">{ctaLabel} →</div>
  </Link>
);

export default function InterviewerDashboardPage() {
  const dispatch = useDispatch();
  const { upcoming, past, listStatus, listError } = useSelector((s) => s.myInterviews);

  useEffect(() => { dispatch(fetchMyInterviews()); }, [dispatch]);

  if (listStatus === 'loading' && !upcoming.length && !past.length) {
    return <Loader message="Loading your interviews…" />;
  }
  if (listStatus === 'failed') {
    return <EmptyState title="Couldn't load" description={listError || 'Try again later.'} />;
  }

  return (
    <div className="interviewer-dashboard">
      <header className="interviewer-dashboard__head">
        <h1>Your interviews</h1>
        <p className="interviewer-dashboard__sub">{upcoming.length} upcoming · {past.length} past</p>
      </header>

      <section>
        <h2>Upcoming</h2>
        {upcoming.length === 0 ? (
          <EmptyState title="No upcoming interviews" description="You'll see scheduled interviews here." />
        ) : (
          <div className="interviewer-dashboard__grid">
            {upcoming.map((i) => (
              <InterviewCard
                key={i._id || i.id}
                interview={i}
                ctaLabel="Open"
                ctaTo={`/interviewer/interviews/${i._id || i.id}`}
                badge={<StatusBadge status={i.status} />}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2>Past</h2>
        {past.length === 0 ? (
          <EmptyState title="No past interviews yet" description="Once you complete interviews, they'll appear here." />
        ) : (
          <div className="interviewer-dashboard__grid">
            {past.map((i) => (
              <InterviewCard
                key={i._id || i.id}
                interview={i}
                ctaLabel={i.reviewSubmitted ? 'View review' : 'Submit review'}
                ctaTo={`/interviewer/interviews/${i._id || i.id}`}
                badge={reviewBadge(i)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
