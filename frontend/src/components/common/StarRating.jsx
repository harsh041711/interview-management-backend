import './StarRating.scss';

export default function StarRating({ value = 0, onChange, readOnly = false, label, size = 'md' }) {
  const num = Number(value) || 0;
  return (
    <div className={`star-rating star-rating--${size}`}>
      {label && <span className="star-rating__label">{label}</span>}
      <div className="star-rating__row" role="radiogroup" aria-label={label || 'Rating'}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={`star-rating__star ${num >= n ? 'is-on' : ''}`}
            onClick={() => !readOnly && onChange?.(n)}
            disabled={readOnly}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
            role="radio"
            aria-checked={num === n}
          >
            ★
          </button>
        ))}
        <span className="star-rating__value">{num ? `${num}/5` : '—/5'}</span>
      </div>
    </div>
  );
}
