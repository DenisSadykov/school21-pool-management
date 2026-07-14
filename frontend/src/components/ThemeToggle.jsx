import React from 'react';
import { Moon, Sun } from 'lucide-react';

function ThemeToggle({ theme, onToggle, compact = false }) {
  const isDark = theme === 'dark';
  const label = isDark ? 'Светлая тема' : 'Тёмная тема';
  const Icon = isDark ? Sun : Moon;

  return (
    <button
      type="button"
      className={compact ? 'theme-toggle theme-toggle-compact' : 'dropdown-item theme-toggle'}
      onClick={onToggle}
      aria-label={label}
      title={compact ? label : undefined}
    >
      <Icon size={15} aria-hidden="true" />
      {!compact && <span>{label}</span>}
      {!compact && (
        <span className={`theme-toggle-track ${isDark ? 'active' : ''}`} aria-hidden="true">
          <span className="theme-toggle-thumb" />
        </span>
      )}
    </button>
  );
}

export default ThemeToggle;
