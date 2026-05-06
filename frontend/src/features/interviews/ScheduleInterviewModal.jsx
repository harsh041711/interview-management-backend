import { useEffect, useState } from 'react';
import Modal from '@/components/common/Modal';
import Button from '@/components/common/Button';
import Input from '@/components/common/Input';
import DateTimeInput from '@/components/common/DateTimeInput';
import { useToast } from '@/components/common/Toast';
import { useDispatch } from 'react-redux';
import { candidateApi } from '@/api/candidateApi';
import { interviewerApi } from '@/api/interviewerApi';
import { scheduleInterview, updateInterview } from './interviewSlice';
import './ScheduleInterviewModal.scss';

const ERROR_MESSAGES = {
  E_NOT_SHORTLISTED: "This candidate isn't shortlisted (so they can't be scheduled)",
  E_INTERVIEWER_INACTIVE: "Interviewer is inactive — re-activate them or pick another",
  E_INTERVIEWER_BUSY: "Interviewer has another interview in this window",
};

const initialForm = () => ({
  candidateId: '',
  interviewerId: '',
  scheduledAt: '',
  durationMinutes: 45,
  meetingUrl: '',
  notes: '',
});

/**
 * Props:
 *   open     — boolean
 *   onClose  — callback
 *   initial  — interview object for edit mode (null for create)
 */
export default function ScheduleInterviewModal({ open, onClose, initial }) {
  const dispatch = useDispatch();
  const { push } = useToast();

  const isEdit = !!initial;

  const [form, setForm] = useState(initialForm);
  const [candidates, setCandidates] = useState([]);
  const [interviewers, setInterviewers] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!open) return;
    setFormError('');

    if (isEdit && initial) {
      setForm({
        candidateId: initial.candidate?.id || initial.candidate || '',
        interviewerId: initial.interviewer?.id || initial.interviewer || '',
        scheduledAt: initial.scheduledAt || '',
        durationMinutes: initial.durationMinutes || 45,
        meetingUrl: initial.meetingUrl || '',
        notes: initial.notes || '',
      });
    } else {
      setForm(initialForm());
    }

    // Load candidates and interviewers
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
  }, [open, isEdit, initial]); // eslint-disable-line react-hooks/exhaustive-deps

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

    if (!form.candidateId || !form.interviewerId || !form.scheduledAt || !form.meetingUrl) {
      setFormError('Candidate, interviewer, date/time, and meeting URL are required.');
      return;
    }
    if (!/^https?:\/\/.+/.test(form.meetingUrl.trim())) {
      setFormError('Meeting URL must start with http:// or https://');
      return;
    }

    const payload = {
      scheduledAt: form.scheduledAt,
      durationMinutes: Number(form.durationMinutes) || 45,
      meetingUrl: form.meetingUrl.trim(),
      notes: form.notes.trim() || undefined,
    };

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
      push({ type: 'success', message: isEdit ? 'Interview updated' : 'Interview scheduled' });
      handleClose();
    } else {
      const code = action.payload?.details?.code;
      const msg = ERROR_MESSAGES[code] || action.payload?.message || 'Failed to save interview';
      setFormError(msg);
    }
  };

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
            {isEdit ? 'Save changes' : 'Schedule'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="schedule-form" noValidate>
        {formError && (
          <div className="schedule-form__error">{formError}</div>
        )}

        {loadingData && <p className="schedule-form__loading">Loading candidates and interviewers…</p>}

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

        <Input
          label="Meeting URL"
          type="url"
          value={form.meetingUrl}
          onChange={set('meetingUrl')}
          placeholder="https://meet.google.com/..."
          hint="Must start with https://"
        />

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
