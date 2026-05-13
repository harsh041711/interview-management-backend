import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { logout } from '@/features/auth/authSlice';
import './InterviewerLayout.scss';

export default function InterviewerLayout() {
  const user = useSelector((s) => s.auth.user);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const onLogout = () => {
    dispatch(logout());
    navigate('/login', { replace: true });
  };

  return (
    <div className="interviewer-layout">
      <aside className="interviewer-layout__side">
        <div className="interviewer-layout__brand">
          <span className="interviewer-layout__brand-mark">●</span>
          <div>
            <div className="interviewer-layout__brand-title">Interviewer</div>
            <div className="interviewer-layout__brand-sub">Portal</div>
          </div>
        </div>
        <nav className="interviewer-layout__nav">
          <NavLink to="/interviewer/dashboard" className={({ isActive }) => `interviewer-layout__link ${isActive ? 'is-active' : ''}`}>
            Dashboard
          </NavLink>
        </nav>
      </aside>
      <div className="interviewer-layout__main">
        <header className="interviewer-layout__header">
          <div className="interviewer-layout__user">
            {user?.name && <span className="interviewer-layout__name">{user.name}</span>}
            {user?.email && <span className="interviewer-layout__email">{user.email}</span>}
          </div>
          <button type="button" className="interviewer-layout__logout" onClick={onLogout}>Log out</button>
        </header>
        <main className="interviewer-layout__content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
