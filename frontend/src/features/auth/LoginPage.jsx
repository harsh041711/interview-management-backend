import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import Button from '@/components/common/Button';
import Input from '@/components/common/Input';
import { clearAuthError, loginThunk } from './authSlice';
import './LoginPage.scss';

export default function LoginPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { token, status, error } = useSelector((s) => s.auth);

  const [form, setForm] = useState({ email: '', password: '' });
  const [touched, setTouched] = useState({});

  useEffect(() => () => { dispatch(clearAuthError()); }, [dispatch]);

  if (token) {
    const dest = location.state?.from?.pathname || '/dashboard';
    return <Navigate to={dest} replace />;
  }

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  const onBlur = (e) => setTouched((t) => ({ ...t, [e.target.name]: true }));

  const errors = {
    email: !form.email ? 'Email is required' : !/.+@.+\..+/.test(form.email) ? 'Invalid email' : '',
    password: !form.password ? 'Password is required' : '',
  };
  const hasError = Boolean(errors.email || errors.password);

  const submit = async (e) => {
    e.preventDefault();
    setTouched({ email: true, password: true });
    if (hasError) return;
    const action = await dispatch(loginThunk(form));
    if (loginThunk.fulfilled.match(action)) {
      const dest = location.state?.from?.pathname || '/dashboard';
      navigate(dest, { replace: true });
    }
  };

  return (
    <div className="login-page">
      <div className="login-page__panel fade-in">
        <h1>Welcome back</h1>
        <p className="login-page__sub">Sign in to manage candidates and review interview reports.</p>

        <form onSubmit={submit} noValidate>
          <Input
            type="email"
            name="email"
            label="Email"
            value={form.email}
            onChange={onChange}
            onBlur={onBlur}
            autoComplete="email"
            error={touched.email ? errors.email : ''}
            placeholder="admin@company.com"
            required
          />
          <Input
            type="password"
            name="password"
            label="Password"
            value={form.password}
            onChange={onChange}
            onBlur={onBlur}
            autoComplete="current-password"
            error={touched.password ? errors.password : ''}
            placeholder="Your password"
            required
          />
          {error && <div className="login-page__error">{error}</div>}
          <Button type="submit" loading={status === 'loading'} fullWidth>
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
