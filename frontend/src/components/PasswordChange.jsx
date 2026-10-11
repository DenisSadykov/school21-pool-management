import React, { useState } from 'react';
import { api, clearSession, setSession } from '../api';
import PasswordInput from './PasswordInput';
import '../styles/Login.css';

export default function PasswordChange({ user, setUser, required = false }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setMessage('');
    if (next !== confirm) return setMessage('Пароли не совпадают');
    if (next.length < 8 || next.length > 256) return setMessage('Пароль должен содержать от 8 до 256 символов');
    if (next.toLowerCase() === user.nick.toLowerCase() || next === current) {
      return setMessage('Новый пароль должен отличаться от ника и текущего пароля');
    }
    setBusy(true);
    try {
      const result = await api.post('/api/me/password', { current_password: current, new_password: next });
      setSession(result.token, result.user);
      setUser(result.user);
      setCurrent(''); setNext(''); setConfirm('');
      setMessage('Пароль обновлён. Другие сеансы завершены.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={required ? 'login-container' : 'manage-section'}>
      <div className={required ? 'login-box' : undefined}>
        <h2>{required ? 'Задайте свой пароль' : 'Сменить пароль'}</h2>
        {required && <p>Вы вошли как @{user.nick}. Начальный пароль — ваш ник. Чтобы открыть платформу, замените его на личный пароль.</p>}
        <form onSubmit={submit}>
          <div className="form-group">
            <label htmlFor="change-current">Текущий пароль</label>
            <PasswordInput id="change-current" label="Текущий пароль" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required maxLength={256} />
          </div>
          <div className="form-group">
            <label htmlFor="change-next">Новый пароль</label>
            <PasswordInput id="change-next" label="Новый пароль" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} maxLength={256} />
          </div>
          <div className="form-group">
            <label htmlFor="change-confirm">Повторите новый пароль</label>
            <PasswordInput id="change-confirm" label="Повторите новый пароль" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} maxLength={256} />
          </div>
          {message && <p role="status">{message}</p>}
          <button className="btn-primary" disabled={busy} type="submit">{busy ? 'Сохраняем...' : 'Сохранить пароль'}</button>
        </form>
        {required && <button type="button" className="btn-mini" disabled={busy} onClick={() => { clearSession(); setUser(null); }}>Выйти</button>}
      </div>
    </div>
  );
}
