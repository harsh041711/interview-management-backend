import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import EmptyState from '@/components/common/EmptyState';
import Loader from '@/components/common/Loader';
import StatusBadge from '@/components/common/StatusBadge';
import { fetchSubmissions } from './submissionSlice';
import { formatDate } from '@/utils/formatters';
import './SubmissionListPage.scss';

export default function SubmissionListPage() {
  const dispatch = useDispatch();
  const { list, status, meta, error } = useSelector((s) => s.submissions);

  useEffect(() => { dispatch(fetchSubmissions({ page: 1, limit: 20 })); }, [dispatch]);

  return (
    <div className="submissions-page">
      <header className="submissions-page__head">
        <h1>Submissions</h1>
        <p className="submissions-page__sub">{meta.total} total</p>
      </header>

      {status === 'loading' && list.length === 0 ? (
        <Loader message="Loading submissions…" />
      ) : error ? (
        <EmptyState title="Failed to load" description={error} />
      ) : list.length === 0 ? (
        <EmptyState title="No submissions yet" description="Submissions appear once a candidate completes their test." />
      ) : (
        <div className="submissions-table">
          <table>
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Tech</th>
                <th>Score</th>
                <th>Status</th>
                <th>Submitted</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s._id}>
                  <td>
                    <div className="submissions-table__candidate">
                      {s.candidate?.photoUrl
                        ? <img src={s.candidate.photoUrl} alt="" />
                        : <span className="submissions-table__avatar">{s.candidate?.name?.[0] || '?'}</span>}
                      <div>
                        <div className="submissions-table__name">{s.candidate?.name}</div>
                        <div className="submissions-table__email">{s.candidate?.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>{(s.candidate?.techStack || []).join(', ')}</td>
                  <td>
                    <strong>{s.totalScore} / {s.maxScore}</strong>
                    <span className="submissions-table__pct"> {s.percentage}%</span>
                  </td>
                  <td>
                    <StatusBadge status={s.cheatDetected ? 'cheated' : s.autoSubmitted ? 'auto_submitted' : 'submitted'} />
                  </td>
                  <td>{formatDate(s.submittedAt)}</td>
                  <td><Link to={`/submissions/${s._id}`}>View →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
