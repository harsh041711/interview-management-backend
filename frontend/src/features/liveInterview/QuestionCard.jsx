import { useState } from 'react';
import { liveInterviewApi } from '@/api/liveInterviewApi';
import './QuestionCard.scss';

const DIFFICULTY_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

export default function QuestionCard({
  question,
  index,
  onChange,
  isListening = false,
  onStopListening,
}) {
  const asked = !!question.askedAt;
  const onToggleAsked = () => onChange(index, 'askedAt', asked ? null : new Date().toISOString());
  const onNote = (e) => onChange(index, 'note', e.target.value);
  const onRate = (n) => onChange(index, 'rating', n);

  const [suggestions, setSuggestions] = useState([]);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState('');

  const note = question.note || '';
  const canSuggest = !suggesting && note.trim().length > 0;

  const onSuggest = async () => {
    if (!canSuggest) return;
    if (isListening && onStopListening) onStopListening();
    setSuggesting(true);
    setSuggestError('');
    setSuggestions([]);
    try {
      const out = await liveInterviewApi.suggestFollowUps({
        questionText: question.text,
        note,
        topic: question.topic,
        difficulty: question.difficulty,
      });
      setSuggestions(out.suggestions || []);
    } catch (err) {
      setSuggestError(err?.response?.data?.message || 'Couldn’t generate suggestions — try again.');
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <div className={`qc ${asked ? 'qc--asked' : ''}`}>
      <div className="qc__head">
        <span className={`qc__diff qc__diff--${question.difficulty}`}>
          {DIFFICULTY_LABEL[question.difficulty] || question.difficulty}
        </span>
        {question.topic && <span className="qc__topic">{question.topic}</span>}
        <button type="button" className="qc__toggle" onClick={onToggleAsked}>
          {asked ? '✓ Asked' : 'Mark asked'}
        </button>
      </div>
      <div className="qc__text">{question.text}</div>

      {isListening && (
        <button
          type="button"
          className="qc__listening"
          onClick={onStopListening}
          aria-label="Stop listening"
        >
          <span className="qc__listening-dot" /> Listening — click to stop
        </button>
      )}

      <textarea
        className="qc__note"
        placeholder="Note will appear here as you (or the candidate) speak…"
        value={note}
        onChange={onNote}
        maxLength={500}
        rows={2}
      />

      <div className="qc__suggest-row">
        <button
          type="button"
          className="qc__suggest-btn"
          onClick={onSuggest}
          disabled={!canSuggest}
        >
          {suggesting ? 'Generating…' : '💡 Suggest follow-ups'}
        </button>
      </div>

      {suggestError && (
        <div className="qc__suggest-error">{suggestError}</div>
      )}

      {suggestions.length > 0 && (
        <div className="qc__suggestions">
          <div className="qc__suggestions-head">
            Follow-up suggestions
            <button type="button" className="qc__regen" onClick={onSuggest} disabled={suggesting}>
              ↻ Regenerate
            </button>
          </div>
          <ul>
            {suggestions.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}

      <div className="qc__rate">
        <span>Rating:</span>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            type="button"
            key={n}
            className={`qc__star ${n <= (question.rating || 0) ? 'qc__star--on' : ''}`}
            onClick={() => onRate(question.rating === n ? null : n)}
            aria-label={`${n} star`}
          >★</button>
        ))}
        <span className="qc__rate-val">{question.rating ? `${question.rating}/5` : '—'}</span>
      </div>
    </div>
  );
}
