import { useCallback, useEffect, useRef, useState } from 'react';

// Returns the SpeechRecognition class for the current browser, or null if
// unavailable. We check both the prefixed and unprefixed names because
// Chrome uses `webkitSpeechRecognition`, some other Chromium browsers
// expose `SpeechRecognition` directly.
const getRecognitionCtor = () => {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
};

/**
 * Owns a single SpeechRecognition instance for the tab and exposes a
 * controlled start/stop API tied to question indexes on the co-pilot page.
 *
 * Usage from LiveInterviewPage:
 *   const t = useLiveTranscript();
 *   if (t.supported) t.start(index, (chunk) => onFieldChange(index, 'note', existingNote + chunk));
 *   t.stop();
 */
export default function useLiveTranscript() {
  const ctorRef = useRef(getRecognitionCtor());
  const recogRef = useRef(null);
  const onTextRef = useRef(null);
  const currentIndexRef = useRef(null);

  const [supported] = useState(() => !!getRecognitionCtor());
  const [isListening, setIsListening] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(null);
  const [error, setError] = useState(null);

  const stop = useCallback(() => {
    const r = recogRef.current;
    if (r) {
      try { r.stop(); } catch { /* ignore */ }
    }
    recogRef.current = null;
    onTextRef.current = null;
    currentIndexRef.current = null;
    setIsListening(false);
    setCurrentIndex(null);
  }, []);

  const start = useCallback((index, onText) => {
    const Ctor = ctorRef.current;
    if (!Ctor) return;
    // Stop any prior recognition before swapping to a new question.
    if (recogRef.current) {
      try { recogRef.current.stop(); } catch { /* ignore */ }
    }
    const recog = new Ctor();
    recog.continuous = true;
    recog.interimResults = true;
    recog.lang = 'en-US';
    recog.onresult = (event) => {
      // Build only the FINAL transcript chunks added since last fire.
      let finalChunk = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const r = event.results[i];
        if (r.isFinal) finalChunk += r[0].transcript;
      }
      if (finalChunk && onTextRef.current) {
        onTextRef.current(finalChunk);
      }
    };
    recog.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setError('permission-denied');
        stop();
      } else if (event.error === 'no-speech') {
        // Browser auto-stops after silence; just clean up state.
        stop();
      } else {
        setError(event.error || 'unknown');
        stop();
      }
    };
    recog.onend = () => {
      // Recognition can end on its own (e.g., after long silence). Reflect that.
      if (recogRef.current === recog) {
        recogRef.current = null;
        onTextRef.current = null;
        currentIndexRef.current = null;
        setIsListening(false);
        setCurrentIndex(null);
      }
    };
    recogRef.current = recog;
    onTextRef.current = onText;
    currentIndexRef.current = index;
    setIsListening(true);
    setCurrentIndex(index);
    setError(null);
    try {
      recog.start();
    } catch (e) {
      // .start() throws if called twice rapidly; surface as an error and clean up.
      setError(e.message || 'start-failed');
      stop();
    }
  }, [stop]);

  // Tab/page hidden → stop the mic for privacy and battery.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && recogRef.current) stop();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [stop]);

  // Stop on unmount.
  useEffect(() => () => { stop(); }, [stop]);

  return { supported, isListening, currentIndex, error, start, stop };
}
