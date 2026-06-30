import React from 'react';
import '../styles/TribeLabel.css';

const TRIBE_ICONS = {
  'Олени': '/tribe-icons/deer.png',
  'Ленты': '/tribe-icons/ribbons.png',
  'Короны': '/tribe-icons/crowns.png',
};

function TribeLabel({ tribe, className = '', size = 18, showText = true }) {
  if (!tribe) return null;

  const icon = TRIBE_ICONS[tribe];
  const classes = ['tribe-label', className].filter(Boolean).join(' ');

  return (
    <span className={classes}>
      {showText && <span className="tribe-label__text">{tribe}</span>}
      {icon && (
        <img
          className="tribe-label__icon"
          src={icon}
          alt=""
          aria-hidden="true"
          style={{ width: size, height: size }}
        />
      )}
    </span>
  );
}

export default TribeLabel;
