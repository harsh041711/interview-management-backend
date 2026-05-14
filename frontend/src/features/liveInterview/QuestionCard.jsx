import './QuestionCard.scss';

const DIFFICULTY_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

export default function QuestionCard({ question, index, onChange }) {
  const asked = !!question.askedAt;
  const onToggleAsked = () => onChange(index, 'askedAt', asked ? null : new Date().toISOString());
  const onNote = (e) => onChange(index, 'note', e.target.value);
  const onRate = (n) => onChange(index, 'rating', n);

  return (
    <div className={`qc ${asked ? 'qc--asked' : ''}`}>
      <div className="qc__head">
        <span className={`qc__diff qc__diff--${question.difficulty}`}>{DIFFICULTY_LABEL[question.difficulty] || question.difficulty}</span>
        {question.topic && <span className="qc__topic">{question.topic}</span>}
        <button type="button" className="qc__toggle" onClick={onToggleAsked}>
          {asked ? '✓ Asked' : 'Mark asked'}
        </button>
      </div>
      <div className="qc__text">{question.text}</div>
      <textarea
        className="qc__note"
        placeholder="Quick note about the answer…"
        value={question.note || ''}
        onChange={onNote}
        maxLength={500}
        rows={2}
      />
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
