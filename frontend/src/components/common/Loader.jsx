import './Loader.scss';

export default function Loader({ message = 'Loading…', fullscreen = false }) {
  return (
    <div className={`loader ${fullscreen ? 'loader--fullscreen' : ''}`}>
      <span className="loader__spinner" />
      <span className="loader__msg">{message}</span>
    </div>
  );
}
