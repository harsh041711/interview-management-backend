import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useToast } from '@/components/common/Toast';
import Button from '@/components/common/Button';
import DateTimeInput from '@/components/common/DateTimeInput';
import { submitReschedule } from './interviewViewSlice';
import './RescheduleRequestForm.scss';

const ERROR_MESSAGES = {
  E_RESCHEDULE_PENDING: 'A reschedule request is already pending HR review. Please wait for their decision.',
  E_NOT_RESCHEDULABLE: 'This interview cannot be rescheduled in its current state.',
};

export default function RescheduleRequestForm({ token, onCancel }) {
  const dispatch = useDispatch();
  const toast = useToast();
  const { submitStatus, details } = useSelector((s) => s.interviewView);

  const defaultProposedAt = (() => {
    if (!details?.schedule?.scheduledAt) return '';
    const d = new Date(details.schedule.scheduledAt);
    d.setDate(d.getDate() + 1);
    return d.toISOString();
  })();

  const [proposedAt, setProposedAt] = useState(defaultProposedAt);
  const [proposedDurationMinutes, setProposedDurationMinutes] = useState('');
  const [reason, setReason] = useState('');
  const [fieldError, setFieldError] = useState(null);

  const isSubmitting = submitStatus === 'loading';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFieldError(null);

    if (!proposedAt) {
      setFieldError('Please select a proposed time.');
      return;
    }

    const parsedDuration = proposedDurationMinutes !== ''
      ? parseInt(proposedDurationMinutes, 10)
      : undefined;

    if (parsedDuration !== undefined && (Number.isNaN(parsedDuration) || parsedDuration < 15 || parsedDuration > 240)) {
      setFieldError('Duration must be between 15 and 240 minutes.');
      return;
    }

    const trimmedReason = reason.trim() || undefined;

    const resultAction = await dispatch(
      submitReschedule({
        token,
        proposedAt,
        proposedDurationMinutes: parsedDuration,
        reason: trimmedReason,
      }),
    );

    if (submitReschedule.fulfilled.match(resultAction)) {
      toast.push({ message: 'Reschedule request submitted', type: 'success' });
      onCancel?.();
    } else {
      const err = resultAction.payload;
      const code = err?.details?.code || err?.code;
      const msg = ERROR_MESSAGES[code] || err?.message || 'Failed to submit reschedule request.';
      toast.push({ message: msg, type: 'error' });
    }
  };

  return (
    <form className="reschedule-form" onSubmit={handleSubmit} noValidate>
      <h3 className="reschedule-form__title">Request a reschedule</h3>

      <DateTimeInput
        label="New time"
        value={proposedAt}
        onChange={setProposedAt}
        min={new Date(Date.now() + 15 * 60 * 1000).toISOString()}
        disabled={isSubmitting}
      />

      <label className="reschedule-form__field">
        <span className="field__label">Duration (minutes)</span>
        <input
          type="number"
          className="field__input"
          placeholder={`Same as current (${details?.schedule?.durationMinutes ?? 45} min)`}
          value={proposedDurationMinutes}
          onChange={(e) => setProposedDurationMinutes(e.target.value)}
          min={15}
          max={240}
          disabled={isSubmitting}
        />
        <span className="field__hint">Leave blank to keep the same duration</span>
      </label>

      <label className="reschedule-form__field">
        <span className="field__label">Reason (optional)</span>
        <textarea
          className="field__input reschedule-form__textarea"
          placeholder="Briefly describe why you need to reschedule"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          rows={3}
          disabled={isSubmitting}
        />
        <span className="field__hint">{reason.length}/500</span>
      </label>

      {fieldError && <p className="reschedule-form__error">{fieldError}</p>}

      <div className="reschedule-form__actions">
        <Button type="submit" loading={isSubmitting} disabled={isSubmitting}>
          Submit request
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
