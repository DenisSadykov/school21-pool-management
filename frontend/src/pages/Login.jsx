import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api, setSession } from '../api';
import '../styles/Login.css';

function Login({ setUser }) {
  const [nick, setNick] = useState('');
  const [password, setPassword] = useState('');
  const [needPassword, setNeedPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef(null);
  const normalizedNick = nick.trim().toLowerCase();
  const shouldShowPassword = useMemo(
    () => needPassword || ['admin', 'teamlead', 'team_lead', 'тимлид', 'админ'].includes(normalizedNick),
    [needPassword, normalizedNick],
  );

  useEffect(() => {
    if (shouldShowPassword) {
      passwordRef.current?.focus();
    }
  }, [shouldShowPassword]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!nick.trim()) {
      setError('Введите ник');
      return;
    }
    if (shouldShowPassword && !password.trim()) {
      setError('Введите пароль');
      return;
    }
    setLoading(true);
    try {
      const data = await api.post('/api/auth/login', {
        nick: nick.trim(),
        password,
      });
      setSession(data.token, data.user);
      setUser(data.user);
    } catch (err) {
      // если роль требует пароль — покажем поле пароля
      if (/пароль/i.test(err.message) && !needPassword) {
        setNeedPassword(true);
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h1>School 21 Pool</h1>
        <p className="subtitle">Система управления бассейном</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="nick">Твой ник</label>
            <input
              id="nick"
              type="text"
              placeholder="например, nieshays"
              value={nick}
              onChange={(e) => setNick(e.target.value)}
              autoFocus
              autoCapitalize="none"
            />
          </div>

          {shouldShowPassword && (
            <div className="form-group">
              <label htmlFor="password">Пароль (для тимлида / админа)</label>
              <input
                ref={passwordRef}
                id="password"
                type="password"
                placeholder="Пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="btn-login" disabled={loading}>
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>

        <div className="login-footer">
          <p className="text-muted">
            Волонтёры и трайб-мастера — вход по нику без пароля.<br />
            Ник должен быть заранее внесён тимлидом.
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;
