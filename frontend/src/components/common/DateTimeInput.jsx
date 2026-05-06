import './DateTimeInput.scss';
import { toDateTimeLocalValue, fromDateTimeLocalValue, localTimezoneLabel } from '@/utils/datetime';

/**
 * A <input type="datetime-local"> wrapper that works with ISO strings.
 *
 * Props:
 *   label      — field label
 *   value      — ISO string (or '')
 *   onChange   — called with ISO string
 *   min        — ISO string; defaults to now + 1 min
 *   error      — error message string
 *   hint       — hint string (appended after timezone hint)
 *   disabled   — forwarded to <input>
 */
export default function DateTimeInput({ label, value, onChange, min, error, hint, disabled }) {
  const minValue = min
    ? toDateTimeLocalValue(min)
    : toDateTimeLocalValue(new Date(Date.now() + 60_000).toISOString());

  const handleChange = (e) => {
    onChange?.(fromDateTimeLocalValue(e.target.value));
  };

  return (
    <label className={`datetime-input field ${error ? 'field--error' : ''}`}>
      {label && <span className="field__label">{label}</span>}
      <input
        type="datetime-local"
        className="field__input"
        value={toDateTimeLocalValue(value)}
        onChange={handleChange}
        min={minValue}
        disabled={disabled}
      />
      <span className="field__hint">
        Local time — {localTimezoneLabel()}
        {hint ? ` · ${hint}` : ''}
      </span>
      {error && <span className="field__error">{error}</span>}
    </label>
  );
}
