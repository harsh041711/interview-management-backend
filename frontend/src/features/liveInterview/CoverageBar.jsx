import './CoverageBar.scss';

export default function CoverageBar({ questions = [] }) {
  const total = questions.length;
  const asked = questions.filter((q) => q.askedAt).length;
  const pct = total ? Math.round((asked / total) * 100) : 0;

  const topics = {};
  for (const q of questions) {
    if (!q.topic) continue;
    if (!topics[q.topic]) topics[q.topic] = { covered: false };
    if (q.askedAt) topics[q.topic].covered = true;
  }
  const topicEntries = Object.entries(topics);

  return (
    <div className="cov">
      <div className="cov__bar">
        <div className="cov__fill" style={{ width: `${pct}%` }} />
        <span className="cov__label">{asked} / {total} asked</span>
      </div>
      {topicEntries.length > 0 && (
        <div className="cov__topics">
          {topicEntries.map(([name, info]) => (
            <span key={name} className={`cov__chip ${info.covered ? 'cov__chip--on' : ''}`}>
              {info.covered ? '✓ ' : '○ '}{name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
