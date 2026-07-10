import React from 'react';

function Loader({ text = 'Загрузка...', fullscreen = false, compact = false }) {
  return (
    <div className={`loading ${fullscreen ? 'loading-fullscreen' : ''} ${compact ? 'loading-compact' : ''}`}>
      <div className="loading-shell" aria-live="polite" aria-busy="true">
        <div className="loading-logo-wrap">
          <img className="loading-logo" src="/school21-logo.webp" alt="" />
        </div>
        <div className="loading-text">{text}</div>
      </div>
    </div>
  );
}

export default Loader;
