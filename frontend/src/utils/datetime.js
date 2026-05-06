/**
 * Datetime utility functions for the admin UI.
 * Pure functions — no React, no side-effects.
 */

/**
 * Formats an ISO date string to "Mon, May 11, 2026 · 14:30" style.
 * @param {string} isoString
 * @returns {string}
 */
export const formatScheduledAt = (isoString) => {
  if (!isoString) return '—';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '—';

  const datePart = d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const timePart = d.toLocaleString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });

  return `${datePart} · ${timePart}`;
};

/**
 * Returns the IANA timezone string for the current locale, e.g. "Asia/Kolkata".
 * @returns {string}
 */
export const localTimezoneLabel = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * Converts an ISO string to the YYYY-MM-DDTHH:mm format required by
 * <input type="datetime-local">.
 * @param {string} iso
 * @returns {string}
 */
export const toDateTimeLocalValue = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // Pad to YYYY-MM-DDTHH:mm
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${mins}`;
};

/**
 * Converts a datetime-local input value string back to an ISO string.
 * @param {string} value — e.g. "2026-05-11T14:30"
 * @returns {string}
 */
export const fromDateTimeLocalValue = (value) => {
  if (!value) return '';
  return new Date(value).toISOString();
};
