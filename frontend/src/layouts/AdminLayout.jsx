import { useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchMeThunk, logout } from '@/features/auth/authSlice';
import './AdminLayout.scss';

const NAV = [
  { to: '/dashboard',    label: 'Dashboard',    icon: '◎' },
  { to: '/candidates',   label: 'Candidates',   icon: '◉' },
  { to: '/questions',    label: 'Questions',    icon: '◆' },
  { to: '/submissions',  label: 'Submissions',  icon: '☰' },
  { to: '/interviewers', label: 'Interviewers', icon: '◈' },
  { to: '/interviews',   label: 'Interviews',   icon: '⌖' },
  { to: '/job-descriptions', label: 'Job Descriptions', icon: '🗎' },
  { to: '/coding-problems', label: 'Coding Problems', icon: '⌨' },
  { to: '/admin/review-edit-requests', label: 'Edit requests', icon: '✎' },
];

export default function AdminLayout() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user, token } = useSelector((s) => s.auth);

  useEffect(() => {
    if (token && !user) dispatch(fetchMeThunk());
  }, [token, user, dispatch]);

  const onLogout = () => {
    dispatch(logout());
    navigate('/login', { replace: true });
  };

  return (
    <div className="admin-layout">
      <aside className="admin-layout__sidebar">
        <div className="admin-layout__brand">
          <div className="admin-layout__logo">IM</div>
          <div>
            <div className="admin-layout__title">Interview Mgmt</div>
            <div className="admin-layout__subtitle">Admin console</div>
          </div>
        </div>
        <nav className="admin-layout__nav">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => `admin-layout__link ${isActive ? 'is-active' : ''}`}>
              <span className="admin-layout__icon">{n.icon}</span>
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="admin-layout__user">
          <div>
            <div className="admin-layout__user-name">{user?.name || 'Admin'}</div>
            <div className="admin-layout__user-email">{user?.email || ''}</div>
          </div>
          <button type="button" onClick={onLogout} className="admin-layout__logout" aria-label="Log out">⏻</button>
        </div>
      </aside>

      <main className="admin-layout__main">
        <Outlet />
      </main>
    </div>
  );
}
