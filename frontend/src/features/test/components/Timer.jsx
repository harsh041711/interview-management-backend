import { useEffect, useState } from 'react';
import { formatDuration } from '@/utils/formatters';

export default function Timer({ endsAt, onExpire }) {
  const [secondsLeft, setSecondsLeft] = useState(() => Math.max(0, Math.floor((new Date(endsAt).getTime() - Date.now()) / 1000)));

  useEffect(() => {
    const tick = () => {
      const left = Math.max(0, Math.floor((new Date(endsAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) onExpire?.();
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt, onExpire]);

  const danger = secondsLeft <= 60;
  const warn = secondsLeft <= 5 * 60;

  return (
    <div className={`timer ${danger ? 'timer--danger' : warn ? 'timer--warn' : ''}`} aria-live="polite">
      <span aria-hidden>⏱</span>
      <span>{formatDuration(secondsLeft)}</span>
    </div>
  );
}
