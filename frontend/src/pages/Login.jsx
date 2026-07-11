import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, setSession } from '../api';
import '../styles/Login.css';

const ROLE_OPTIONS = [
  { value: 'volunteer', label: 'Волонтер' },
  { value: 'tribe_master', label: 'Трайб-мастер' },
  { value: 'team_lead', label: 'Тимлид' },
  { value: 'admin', label: 'Админ' },
];

const PASSWORD_ROLES = new Set(['team_lead', 'admin']);

function Login({ setUser }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [role, setRole] = useState(() => localStorage.getItem('loginRole') || 'volunteer');
  const [nick, setNick] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef(null);
  const shouldShowPassword = PASSWORD_ROLES.has(role);

  useEffect(() => {
    if (shouldShowPassword) {
      passwordRef.current?.focus();
    }
  }, [shouldShowPassword]);

  const handleRoleChange = (e) => {
    const nextRole = e.target.value;
    setRole(nextRole);
    localStorage.setItem('loginRole', nextRole);
    if (!PASSWORD_ROLES.has(nextRole)) {
      setPassword('');
    }
  };

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
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="login-intro">
          <h1>School 21 Pool</h1>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="role">Роль</label>
            <select id="role" value={role} onChange={handleRoleChange}>
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

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
              <label htmlFor="password">Пароль</label>
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
            Ник должен быть заранее добавлен в систему.
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;
