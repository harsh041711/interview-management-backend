import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from '@/components/common/Modal';
import Button from '@/components/common/Button';
import Input from '@/components/common/Input';
import DateTimeInput from '@/components/common/DateTimeInput';
import { useToast } from '@/components/common/Toast';
import { useDispatch, useSelector } from 'react-redux';
import { candidateApi } from '@/api/candidateApi';
import { interviewerApi } from '@/api/interviewerApi';
import { fetchGoogleStatus } from '@/features/settings/settingsSlice';
import { scheduleInterview, updateInterview } from './interviewSlice';
import './ScheduleInterviewModal.scss';

const ERROR_MESSAGES = {
  E_NOT_SHORTLISTED: "This candidate isn't shortlisted (so they can't be scheduled)",
  E_INTERVIEWER_INACTIVE: "Interviewer is inactive — re-activate them or pick another",
  E_INTERVIEWER_BUSY: "Interviewer has another interview in this window",
  E_GOOGLE_NOT_CONNECTED: "Google Calendar isn't connected. Paste a meeting URL or connect Google in Settings.",
  E_CALENDAR_FAILED: "Couldn't auto-generate the meeting. Paste a meeting URL manually.",
};

const initialForm = () => ({
  candidateId: '',
  interviewerId: '',
  scheduledAt: '',
  durationMinutes: 45,
  meetingUrl: '',
  notes: '',
});

export default function ScheduleInterviewModal({ open, onClose, initial }) {
  const dispatch = useDispatch();
  const { push } = useToast();
  const googleStatus = useSelector((s) => s.settings.google);

  const isEdit = !!initial;

  const [form, setForm] = useState(initialForm);
  const [candidates, setCandidates] = useState([]);
  const [interviewers, setInterviewers] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  // Mode: 'auto' (use Google) or 'manual' (paste URL). Forced to 'manual' in edit mode.
  const [mode, setMode] = useState('auto');

  useEffect(() => {
    if (!open) return;
    setFormError('');

    // Fetch Google status when opening (might have changed since app load).
    if (!isEdit) dispatch(fetchGoogleStatus());

    if (isEdit && initial) {
      setForm({
        candidateId: initial.candidate?.id || initial.candidate || '',
        interviewerId: initial.interviewer?.id || initial.interviewer || '',
        scheduledAt: initial.scheduledAt || '',
        durationMinutes: initial.durationMinutes || 45,
        meetingUrl: initial.meetingUrl || '',
        notes: initial.notes || '',
      });
      setMode('manual'); // editing existing — always show the URL field
    } else {
      setForm(initialForm());
    }

    const load = async () => {
      setLoadingData(true);
      try {
        const [cData, iData] = await Promise.all([
          candidateApi.list({ status: 'shortlisted', limit: 100 }),
          interviewerApi.list({ isActive: true, limit: 100 }),
        ]);
        setCandidates(cData.items || []);
        setInterviewers(iData.items || []);
      } catch {
        push({ type: 'error', message: 'Failed to load candidates or interviewers' });
      } finally {
        setLoadingData(false);
      }
    };
    load();
  }, [open, isEdit, initial, dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Default mode based on Google status when modal opens fresh (not edit).
  useEffect(() => {
    if (!open || isEdit) return;
    setMode(googleStatus.connected ? 'auto' : 'manual');
  }, [open, isEdit, googleStatus.connected]);

  const handleClose = () => {
    setForm(initialForm());
    setFormError('');
    onClose?.();
  };

  const set = (key) => (val) => {
    if (typeof val === 'object' && val.target) {
      setForm((f) => ({ ...f, [key]: val.target.value }));
    } else {
      setForm((f) => ({ ...f, [key]: val }));
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!form.candidateId || !form.interviewerId || !form.scheduledAt) {
      setFormError('Candidate, interviewer, and date/time are required.');
      return;
    }
    if (mode === 'manual') {
      if (!form.meetingUrl) {
        setFormError('Meeting URL is required in manual mode.');
        return;
      }
      if (!/^https?:\/\/.+/.test(form.meetingUrl.trim())) {
        setFormError('Meeting URL must start with http:// or https://');
        return;
      }
    }

    const payload = {
      scheduledAt: form.scheduledAt,
      durationMinutes: Number(form.durationMinutes) || 45,
      notes: form.notes.trim() || undefined,
    };
    if (mode === 'manual') {
      payload.meetingUrl = form.meetingUrl.trim();
    } // else: omit meetingUrl entirely; backend will create event

    if (!isEdit) {
      payload.candidateId = form.candidateId;
      payload.interviewerId = form.interviewerId;
    }

    setBusy(true);
    const action = isEdit
      ? await dispatch(updateInterview({ id: initial.id, payload }))
      : await dispatch(scheduleInterview(payload));
    setBusy(false);

    const matchFn = isEdit ? updateInterview.fulfilled : scheduleInterview.fulfilled;
    if (matchFn.match(action)) {
      push({ type: 'success', message: isEdit ? 'Interview updated' : 'Interview scheduled — invites sent' });
      handleClose();
      return;
    }

    const code = action.payload?.details?.code;
    const msg = ERROR_MESSAGES[code] || action.payload?.message || 'Failed to save interview';
    setFormError(msg);

    // Auto-fall-back to manual mode on Google failures
    if (code === 'E_GOOGLE_NOT_CONNECTED' || code === 'E_GOOGLE_TOKEN_REVOKED' || code === 'E_CALENDAR_FAILED') {
      setMode('manual');
    }
  };

  const autoAvailable = googleStatus.configured && googleStatus.connected;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={isEdit ? 'Edit interview' : 'Schedule interview'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>Cancel</Button>
          <Button onClick={submit} loading={busy || loadingData}>
            {isEdit ? 'Save changes' : (mode === 'auto' ? 'Schedule with Google Meet' : 'Schedule')}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="schedule-form" noValidate>
        {formError && (
          <div className="schedule-form__error">{formError}</div>
        )}

        {loadingData && <p className="schedule-form__loading">Loading candidates and interviewers…</p>}

        {!isEdit && (
          <div className="schedule-form__mode">
            <button
              type="button"
              className={`schedule-form__mode-btn ${mode === 'auto' ? 'is-on' : ''}`}
              onClick={() => setMode('auto')}
              disabled={!autoAvailable}
              title={autoAvailable ? '' : 'Connect Google Calendar in Settings first'}
            >
              <div className="schedule-form__mode-title">⚡ Auto-generate with Google Meet</div>
              <div className="schedule-form__mode-sub">
                {autoAvailable
                  ? 'Creates a Calendar event and sends invites automatically.'
                  : 'Google Calendar not connected.'}
              </div>
            </button>
            <button
              type="button"
              className={`schedule-form__mode-btn ${mode === 'manual' ? 'is-on' : ''}`}
              onClick={() => setMode('manual')}
            >
              <div className="schedule-form__mode-title">✎ Paste meeting URL manually</div>
              <div className="schedule-form__mode-sub">Use any video link — Zoom, Meet, Teams, etc.</div>
            </button>
          </div>
        )}

        {!isEdit && !autoAvailable && googleStatus.configured && (
          <div className="schedule-form__hint">
            Tip: connect Google Calendar from <Link to="/admin/settings">Settings</Link> to auto-generate Meet links.
          </div>
        )}

        <div className="field">
          <span className="field__label">Candidate (shortlisted)</span>
          <select
            className="field__input"
            value={form.candidateId}
            onChange={set('candidateId')}
            disabled={isEdit || loadingData}
            required
          >
            <option value="">— Select candidate —</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
            ))}
          </select>
        </div>

        <div className="field">
          <span className="field__label">Interviewer (active)</span>
          <select
            className="field__input"
            value={form.interviewerId}
            onChange={set('interviewerId')}
            disabled={isEdit || loadingData}
            required
          >
            <option value="">— Select interviewer —</option>
            {interviewers.map((iv) => (
              <option key={iv.id} value={iv.id}>
                {iv.name}{iv.expertise?.length ? ` · ${iv.expertise.join(', ')}` : ''}
              </option>
            ))}
          </select>
        </div>

        <DateTimeInput
          label="Date & Time"
          value={form.scheduledAt}
          onChange={set('scheduledAt')}
        />

        <Input
          label="Duration (minutes)"
          type="number"
          min="15"
          max="240"
          value={form.durationMinutes}
          onChange={(e) => setForm((f) => ({ ...f, durationMinutes: e.target.value }))}
          hint="Between 15 and 240 minutes"
        />

        {mode === 'manual' && (
          <Input
            label="Meeting URL"
            type="url"
            value={form.meetingUrl}
            onChange={set('meetingUrl')}
            placeholder="https://meet.google.com/..."
            hint="Must start with https://"
          />
        )}

        <Input
          label="Notes (optional)"
          as="textarea"
          value={form.notes}
          onChange={set('notes')}
          placeholder="Any preparation notes for the interviewer…"
        />
      </form>
    </Modal>
  );
}
