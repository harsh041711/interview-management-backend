export default function QuestionRenderer({ question, value, onChange }) {
  if (!question) return null;

  switch (question.type) {
    case 'mcq':
      return (
        <div className="qr">
          <div className="qr__options">
            {(question.options || []).map((opt) => (
              <label key={opt} className={`qr__option ${value === opt ? 'is-selected' : ''}`}>
                <input
                  type="radio"
                  name={`q-${question.id}`}
                  value={opt}
                  checked={value === opt}
                  onChange={() => onChange(opt)}
                />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        </div>
      );

    case 'multi_select': {
      const arr = Array.isArray(value) ? value : [];
      const toggle = (opt) => {
        const next = arr.includes(opt) ? arr.filter((x) => x !== opt) : [...arr, opt];
        onChange(next);
      };
      return (
        <div className="qr">
          <div className="qr__options">
            {(question.options || []).map((opt) => (
              <label key={opt} className={`qr__option ${arr.includes(opt) ? 'is-selected' : ''}`}>
                <input type="checkbox" checked={arr.includes(opt)} onChange={() => toggle(opt)} />
                <span>{opt}</span>
              </label>
            ))}
          </div>
          <div className="qr__hint">Select all that apply.</div>
        </div>
      );
    }

    case 'one_line':
      return (
        <input
          className="qr__one-line"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type your answer…"
          maxLength={300}
        />
      );

    case 'descriptive':
      return (
        <textarea
          className="qr__descriptive"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Explain your answer in detail…"
          rows={10}
        />
      );

    default:
      return <div>Unsupported question type</div>;
  }
}
