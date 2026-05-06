import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import Button from '@/components/common/Button';
import EmptyState from '@/components/common/EmptyState';
import Loader from '@/components/common/Loader';
import StatusBadge from '@/components/common/StatusBadge';
import { formatScheduledAt } from '@/utils/datetime';
import { fetchInterviews } from './interviewSlice';
import ScheduleInterviewModal from './ScheduleInterviewModal';
import './InterviewListPage.scss';

const STATUSES = ['', 'scheduled', 'reschedule_requested', 'completed', 'cancelled'];
const STATUS_LABELS = {
  '': 'All statuses',
  scheduled: 'Scheduled',
  reschedule_requested: 'Reschedule requested',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export default function InterviewListPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { list, status, meta, error } = useSelector((s) => s.interviews);

  const [filters, setFilters] = useState({ status: '', from: '', to: '', page: 1 });
  const [scheduleOpen, setScheduleOpen] = useState(false);

  useEffect(() => {
    const params = { page: filters.page, limit: meta.limit };
    if (filters.status) params.status = filters.status;
    if (filters.from) params.from = filters.from;
    if (filters.to) params.to = filters.to;
    dispatch(fetchInterviews(params));
  }, [dispatch, filters, meta.limit]);

  return (
    <div className="interviews-page">
      <header className="interviews-page__head">
        <div>
          <h1>Interviews</h1>
          <p className="interviews-page__sub">{meta.total} total · page {meta.page}/{meta.totalPages}</p>
        </div>
        <Button onClick={() => setScheduleOpen(true)}>+ Schedule</Button>
      </header>

      <section className="interviews-page__filters">
        <select
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value, page: 1 }))}
        >
          {STATUSES.map((s) => (
            <option key={s || 'all'} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
        <label className="interviews-page__date-label">
          From
          <input
            type="date"
            className="interviews-page__date"
            value={filters.from}
            onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value, page: 1 }))}
          />
        </label>
        <label className="interviews-page__date-label">
          To
          <input
            type="date"
            className="interviews-page__date"
            value={filters.to}
            onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value, page: 1 }))}
          />
        </label>
      </section>

      {status === 'loading' && list.length === 0 ? (
        <Loader message="Loading interviews…" />
      ) : error ? (
        <EmptyState title="Failed to load" description={error} />
      ) : list.length === 0 ? (
        <EmptyState
          title="No interviews yet"
          description="Schedule a Round 2 interview for a shortlisted candidate."
          action={<Button onClick={() => setScheduleOpen(true)}>+ Schedule</Button>}
        />
      ) : (
        <div className="interviews-table">
          <table>
            <thead>
              <tr>
                <th>Date / Time</th>
                <th>Candidate</th>
                <th>Interviewer</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((iv) => {
                const candidate = iv.candidate || {};
                const interviewer = iv.interviewer || {};
                return (
                  <tr
                    key={iv.id}
                    className="interviews-table__row"
                    tabIndex={0}
                    role="button"
                    onClick={() => navigate(`/interviews/${iv.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate(`/interviews/${iv.id}`);
                      }
                    }}
                  >
                    <td className="interviews-table__time">
                      <div>{formatScheduledAt(iv.scheduledAt)}</div>
                      <div className="interviews-table__duration">{iv.durationMinutes} min</div>
                    </td>
                    <td>
                      <div className="interviews-table__primary">{candidate.name || '—'}</div>
                      <div className="interviews-table__sub">{candidate.email || ''}</div>
                    </td>
                    <td>
                      <div className="interviews-table__primary">{interviewer.name || '—'}</div>
                      <div className="interviews-table__chips">
                        {(interviewer.expertise || []).map((e) => (
                          <span key={e} className="chip">{e}</span>
                        ))}
                      </div>
                    </td>
                    <td><StatusBadge status={iv.status} /></td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => navigate(`/interviews/${iv.id}`)}
                      >
                        View →
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ScheduleInterviewModal open={scheduleOpen} onClose={() => setScheduleOpen(false)} />
    </div>
  );
}
