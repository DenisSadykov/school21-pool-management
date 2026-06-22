import React, { useState } from 'react';
import '../styles/Login.css';

function Login({ setUser }) {
  const [formData, setFormData] = useState({ name: '', role: 'volunteer' });
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Введите имя');
      return;
    }

    try {
      // Валидация через API
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) throw new Error('Ошибка аутентификации');

      const user = await response.json();
      localStorage.setItem('user', JSON.stringify(user));
      setUser(user);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h1>🏊 School 21 Pool</h1>
        <p className="subtitle">Система управления бассейном</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="name">Ваше имя</label>
            <input
              id="name"
              type="text"
              placeholder="Введите ваше имя"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="role">Роль</label>
            <select
              id="role"
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
            >
              <option value="volunteer">Волонтёр</option>
              <option value="team_lead">Team Lead</option>
              <option value="admin">Администратор</option>
            </select>
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="btn-login">
            Войти
          </button>
        </form>

        <div className="login-footer">
          <p className="text-muted">Демо-версия: вход доступен всем</p>
        </div>
      </div>
    </div>
  );
}

export default Login;
