import { useEffect, useRef } from 'react';

const DEFAULT_DEBOUNCE = 400;

export function useAntiCheat({ enabled, onViolation, debounce = DEFAULT_DEBOUNCE } = {}) {
  const triggered = useRef(false);

  useEffect(() => {
    if (!enabled) return undefined;
    triggered.current = false;

    const fire = (eventType, meta) => {
      if (triggered.current) return;
      triggered.current = true;
      onViolation?.({ eventType, at: new Date().toISOString(), meta });
    };

    let timer = null;
    const schedule = (eventType, meta) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fire(eventType, meta), debounce);
    };

    const onVisibility = () => {
      if (document.hidden) schedule('visibility_hidden');
    };
    const onBlur = () => {
      // Ignore blur to a child iframe of our own page (e.g. webcam) — guard with hasFocus
      if (!document.hasFocus()) schedule('window_blur');
    };
    const onPageHide = () => fire('tab_switch', { phase: 'pagehide' });

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [enabled, onViolation, debounce]);
}
