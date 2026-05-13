import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Button from '@/components/common/Button';
import Input from '@/components/common/Input';
import Loader from '@/components/common/Loader';
import { useToast } from '@/components/common/Toast';
import { validateSetupToken, submitSetup, reset } from './accountSetupSlice';
import { setToken, setStoredAdmin } from '@/utils/tokenStorage';
import './SetupPasswordPage.scss';

const PASSWORD_MIN = 8;

export default function SetupPasswordPage() {
  const { token } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { push } = useToast();
  const { validateStatus, validateError, info, submitStatus } = useSelector((s) => s.accountSetup);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  useEffect(() => {
    dispatch(validateSetupToken(token));
    return () => {
      dispatch(reset());
    };
  }, [token, dispatch]);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (password.length < PASSWORD_MIN) {
      push({ type: 'warn', message: `Password must be at least ${PASSWORD_MIN} characters` });
      return;
    }
    if (password !== confirm) {
      push({ type: 'warn', message: 'Passwords do not match' });
      return;
    }
    const action = await dispatch(submitSetup({ token, password }));
    if (submitSetup.fulfilled.match(action)) {
      const { token: jwt, user } = action.payload;
      // Persist using tokenStorage helpers, matching existing auth pattern
      setToken(jwt);
      setStoredAdmin(user);
      push({ type: 'success', message: 'Password set — logging you in…' });
      // Hard navigate so authSlice picks up persisted state on boot
      window.location.href = '/interviewer/dashboard';
    } else {
      push({ type: 'error', message: action.payload?.message || 'Could not set password' });
    }
  };

  if (validateStatus === 'loading' || validateStatus === 'idle') {
    return (
      <div className="setup-password">
        <Loader message="Verifying link…" />
      </div>
    );
  }

  if (validateStatus === 'failed') {
    const code = validateError?.code;
    return (
      <div className="setup-password">
        <div className="setup-password__card setup-password__card--error">
          <h1>Link invalid or expired</h1>
          <p>{validateError?.message || 'This setup link is no longer valid.'}</p>
          {code === 'E_SETUP_TOKEN_INVALID' && (
            <p>You can request a new link below — we'll email you a fresh one.</p>
          )}
          <Link to="/forgot-password" className="setup-password__btn">
            Request new link
          </Link>
        </div>
      </div>
    );
  }

  const isReset = info?.purpose === 'forgot_password';
  const headline = isReset ? 'Reset your password' : 'Welcome — set your password';
  const intro = isReset
    ? `Setting a new password for ${info.email}.`
    : `Welcome, ${info.name}. Pick a password to finish setting up your interviewer account.`;

  return (
    <div className="setup-password">
      <div className="setup-password__card">
        <h1>{headline}</h1>
        <p className="setup-password__intro">{intro}</p>
        <form onSubmit={onSubmit} noValidate>
          <Input
            label="New password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint={`At least ${PASSWORD_MIN} characters`}
            autoComplete="new-password"
            required
          />
          <Input
            label="Confirm password"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
          <Button type="submit" fullWidth loading={submitStatus === 'loading'}>
            {isReset ? 'Update password' : 'Set password and continue'}
          </Button>
        </form>
      </div>
    </div>
  );
}
