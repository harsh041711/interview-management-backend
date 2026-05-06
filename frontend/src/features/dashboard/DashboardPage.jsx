import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { fetchCandidateStats } from '@/features/candidates/candidateSlice';
import './DashboardPage.scss';

const KEYS = [
  { key: 'pending', label: 'Pending', tone: 'pending' },
  { key: 'photo_captured', label: 'Photo captured', tone: 'info' },
  { key: 'in_progress', label: 'In progress', tone: 'info' },
  { key: 'completed', label: 'Completed', tone: 'success' },
  { key: 'expired', label: 'Expired', tone: 'warn' },
  { key: 'cheated', label: 'Cheated', tone: 'danger' },
];

export default function DashboardPage() {
  const dispatch = useDispatch();
  const stats = useSelector((s) => s.candidates.stats);

  useEffect(() => { dispatch(fetchCandidateStats()); }, [dispatch]);

  const total = KEYS.reduce((acc, k) => acc + (stats[k.key] || 0), 0);

  return (
    <div className="dashboard">
      <header className="dashboard__head">
        <div>
          <h1>Dashboard</h1>
          <p className="dashboard__sub">Overview of candidate pipeline and quick actions.</p>
        </div>
        <Link to="/candidates" className="btn btn--primary btn--md">+ New candidate</Link>
      </header>

      <section className="dashboard__cards">
        {KEYS.map((k) => (
          <article key={k.key} className={`stat-card stat-card--${k.tone}`}>
            <div className="stat-card__label">{k.label}</div>
            <div className="stat-card__value">{stats[k.key] || 0}</div>
          </article>
        ))}
        <article className="stat-card stat-card--total">
          <div className="stat-card__label">Total candidates</div>
          <div className="stat-card__value">{total}</div>
        </article>
      </section>

      <section className="dashboard__quick">
        <h3>Get started</h3>
        <ul>
          <li><Link to="/questions">Add or AI-generate questions</Link> for the tech stacks you interview for.</li>
          <li><Link to="/candidates">Create a candidate</Link> — copy their secure test link and share via email.</li>
          <li><Link to="/submissions">Review submissions</Link> with score breakdowns and AI feedback.</li>
        </ul>
      </section>
    </div>
  );
}
