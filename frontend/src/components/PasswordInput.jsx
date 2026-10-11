import React, { useEffect, useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import '../styles/PasswordInput.css';

export default function PasswordInput({ id, label = 'Пароль', ...props }) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!props.value) setVisible(false);
  }, [props.value]);

  useEffect(() => {
    const hide = () => setVisible(false);
    const onVisibility = () => { if (document.hidden) hide(); };
    window.addEventListener('blur', hide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', hide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const action = visible ? 'Скрыть' : 'Показать';
  const Icon = visible ? EyeOff : Eye;
  return (
    <div className="password-control">
      <input {...props} id={inputId} type={visible ? 'text' : 'password'} aria-label={props['aria-label'] || (id ? undefined : label)} className={`password-input-field ${props.className || ''}`} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      <button
        type="button"
        className="password-visibility-button"
        aria-label={`${action} пароль: ${label}`}
        aria-controls={inputId}
        aria-pressed={visible}
        disabled={props.disabled}
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => setVisible((value) => !value)}
      >
        <Icon size={16} aria-hidden="true" />
        <span>{action}</span>
      </button>
    </div>
  );
}
