import React, { useEffect, useRef, useState } from 'react';
import { api, getToken, setSession } from '../api';
import AuthenticatedImage from '../components/AuthenticatedImage';
import '../styles/Pages.css';
import '../styles/Profile.css';

function Profile({ user, setUser }) {
  const [form, setForm] = useState({
    name: '',
    nick: '',
    telegram: '',
  });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    setForm({
      name: user?.name || '',
      nick: user?.nick || '',
      telegram: user?.telegram || '',
    });
  }, [user]);

  const applyUser = (nextUser) => {
    setUser(nextUser);
    setSession(getToken(), nextUser);
  };

  const save = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      const updatedUser = await api.patch('/api/me', form);
      applyUser(updatedUser);
      setMessage('Личные данные сохранены.');
    } catch (error) {
      setMessage(`Ошибка: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const uploadAvatar = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const payload = new FormData();
    payload.append('file', file);
    try {
      const response = await api.upload('/api/me/avatar', payload);
      if (response?.user) {
        applyUser(response.user);
      }
      setMessage('Фото профиля обновлено.');
    } catch (error) {
      setMessage(`Ошибка загрузки фото: ${error.message}`);
    }
  };

  return (
    <div className="page manage-page">
      <h1>Личные данные</h1>
      {message && <div className="alert success">{message}</div>}

      <section className="manage-section">
        <div className="profile-header">
          <span className="profile-avatar-large">
            {user?.avatar_url ? (
              <AuthenticatedImage src={user.avatar_url} alt={user?.name || user?.nick} />
            ) : (
              (user?.nick || '??').slice(0, 2).toUpperCase()
            )}
          </span>
          <div className="profile-header-copy">
            <strong>@{user?.nick}</strong>
            <span>{user?.name || user?.nick}</span>
          </div>
          <button type="button" className="btn-mini" onClick={() => fileRef.current?.click()}>
            Загрузить фото
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            style={{ display: 'none' }}
            onChange={uploadAvatar}
          />
        </div>

        <form className="form" onSubmit={save}>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="profile-name">Имя</label>
              <input
                id="profile-name"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label htmlFor="profile-nick">Ник</label>
              <input
                id="profile-nick"
                value={form.nick}
                onChange={(e) => setForm((prev) => ({ ...prev, nick: e.target.value.replace(/^@+/, '') }))}
              />
            </div>
            <div className="form-group">
              <label htmlFor="profile-telegram">Ник Telegram</label>
              <input
                id="profile-telegram"
                value={form.telegram}
                onChange={(e) => setForm((prev) => ({ ...prev, telegram: e.target.value }))}
                placeholder="@telegram"
              />
            </div>
          </div>
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? 'Сохраняем...' : 'Сохранить'}
          </button>
        </form>
      </section>
    </div>
  );
}

export default Profile;
