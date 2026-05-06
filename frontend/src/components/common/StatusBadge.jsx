import './StatusBadge.scss';

const VARIANTS = {
  pending: 'pending',
  photo_captured: 'info',
  in_progress: 'info',
  completed: 'success',
  expired: 'warn',
  cheated: 'danger',
  active: 'info',
  submitted: 'success',
  auto_submitted: 'warn',
  // Phase 2C additions
  shortlisted: 'success',
  approved: 'success',
  rejected: 'danger',
  scheduled: 'info',
  reschedule_requested: 'warn',
  cancelled: 'pending',
  disqualified: 'danger',
};

const LABELS = {
  pending: 'Pending',
  photo_captured: 'Photo captured',
  in_progress: 'In progress',
  completed: 'Completed',
  expired: 'Expired',
  cheated: 'Cheated',
  active: 'Active',
  submitted: 'Submitted',
  auto_submitted: 'Auto-submitted',
  // Phase 2C additions
  shortlisted: 'Shortlisted',
  approved: 'Approved',
  rejected: 'Rejected',
  scheduled: 'Scheduled',
  reschedule_requested: 'Reschedule requested',
  cancelled: 'Cancelled',
  disqualified: 'Disqualified',
};

export default function StatusBadge({ status }) {
  if (!status) return null;
  const variant = VARIANTS[status] || 'pending';
  return <span className={`status-badge status-badge--${variant}`}>{LABELS[status] || status}</span>;
}
