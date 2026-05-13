import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useSearchParams } from 'react-router-dom';
import Button from '@/components/common/Button';
import { useToast } from '@/components/common/Toast';
import { integrationsApi } from '@/api/integrationsApi';
import { fetchGoogleStatus, disconnectGoogle } from './settingsSlice';
import './SettingsPage.scss';

const QUERY_MESSAGES = {
  connected: { tone: 'success', text: 'Google Calendar connected successfully.' },
  denied: { tone: 'error', text: 'You declined the Google authorization. Try again to connect.' },
  invalid_state: { tone: 'error', text: 'Authorization session expired or was tampered with. Please try again.' },
  no_refresh_token: { tone: 'error', text: 'Google did not return a refresh token. Revoke prior access in your Google Account permissions and reconnect.' },
  exchange_failed: { tone: 'error', text: 'Couldn\'t complete the Google authorization. Please try again.' },
};

export default function SettingsPage() {
  const dispatch = useDispatch();
  const { push } = useToast();
  const [params, setParams] = useSearchParams();
  const { google, googleLoading, googleError } = useSelector((s) => s.settings);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const banner = useMemo(() => {
    const key = params.get('google');
    return key ? QUERY_MESSAGES[key] : null;
  }, [params]);

  useEffect(() => {
    dispatch(fetchGoogleStatus());
  }, [dispatch]);

  // Clear the ?google=... query param a moment after showing the banner.
  useEffect(() => {
    if (!params.get('google')) return;
    const timer = setTimeout(() => {
      params.delete('google');
      setParams(params, { replace: true });
    }, 5000);
    return () => clearTimeout(timer);
  }, [params, setParams]);

  const onConnect = async () => {
    setConnecting(true);
    try {
      const url = await integrationsApi.googleConnectUrl();
      window.location.href = url;
    } catch (err) {
      push({ type: 'error', message: err.response?.data?.message || 'Could not start Google authorization' });
      setConnecting(false);
    }
  };

  const onDisconnect = async () => {
    const ok = window.confirm(
      'Disconnect Google Calendar?\n\nExisting interviews keep their meeting links, but new interviews will need a manually pasted URL until you reconnect.',
    );
    if (!ok) return;
    setDisconnecting(true);
    const action = await dispatch(disconnectGoogle());
    setDisconnecting(false);
    if (disconnectGoogle.fulfilled.match(action)) {
      push({ type: 'success', message: 'Google Calendar disconnected' });
    } else {
      push({ type: 'error', message: action.payload?.message || 'Failed to disconnect' });
    }
  };

  const renderStatus = () => {
    if (!google.configured) {
      return (
        <div className="settings__status is-error">
          <span className="settings__status-dot" />
          <span className="settings__status-text">
            <strong>Not configured.</strong> Google OAuth credentials are missing from the server. Contact your administrator.
          </span>
        </div>
      );
    }
    if (google.connected) {
      return (
        <div className="settings__status is-connected">
          <span className="settings__status-dot" />
          <span className="settings__status-text">
            <strong>Connected</strong> as <code>{google.accountEmail}</code>
            {google.connectedAt && <> · since {new Date(google.connectedAt).toLocaleDateString()}</>}
          </span>
        </div>
      );
    }
    return (
      <div className="settings__status">
        <span className="settings__status-dot" />
        <span className="settings__status-text">
          <strong>Not connected.</strong> Connect a Google account to auto-generate Meet links and send calendar invites.
        </span>
      </div>
    );
  };

  return (
    <div className="settings">
      <header className="settings__header">
        <h1 className="settings__title">Settings</h1>
        <p className="settings__subtitle">Manage integrations and workspace preferences.</p>
      </header>

      {banner && (
        <div className={`settings__banner settings__banner--${banner.tone}`}>{banner.text}</div>
      )}
      {googleError && (
        <div className="settings__banner settings__banner--error">{googleError}</div>
      )}

      <section className="settings__section">
        <h2 className="settings__section-title">Google Calendar</h2>
        <p className="settings__section-sub">
          When connected, scheduling an interview creates a Google Calendar event with an auto-generated Meet link and invites both the candidate and the interviewer.
        </p>

        {googleLoading ? (
          <div className="settings__status"><span className="settings__status-text">Loading…</span></div>
        ) : (
          renderStatus()
        )}

        <div className="settings__actions">
          {google.configured && !google.connected && (
            <Button onClick={onConnect} loading={connecting}>Connect Google Calendar</Button>
          )}
          {google.configured && google.connected && (
            <Button variant="secondary" onClick={onDisconnect} loading={disconnecting}>Disconnect</Button>
          )}
        </div>
      </section>
    </div>
  );
}
