import { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '@/components/common/Button';
import Input from '@/components/common/Input';
import { useToast } from '@/components/common/Toast';
import { authApi } from '@/api/authApi';
import './ForgotPasswordPage.scss';

export default function ForgotPasswordPage() {
  const { push } = useToast();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    try {
      await authApi.forgotPassword(email.trim());
      setSubmitted(true);
    } catch (err) {
      push({ type: 'error', message: err?.response?.data?.message || 'Could not send reset email' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="forgot-password">
      <div className="forgot-password__card">
        <h1>Reset your password</h1>
        {submitted ? (
          <>
            <p className="forgot-password__hint">
              If an interviewer account exists for <strong>{email}</strong>, we've sent a reset link.
              Check your inbox (and spam folder).
            </p>
            <Link to="/login" className="forgot-password__back">Back to login</Link>
          </>
        ) : (
          <form onSubmit={onSubmit} noValidate>
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
            <Button type="submit" loading={busy} fullWidth>Send reset link</Button>
            <Link to="/login" className="forgot-password__back">Back to login</Link>
          </form>
        )}
      </div>
    </div>
  );
}
