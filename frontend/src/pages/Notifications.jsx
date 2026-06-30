import React, { useEffect, useMemo, useState } from 'react';
import { Flame, Megaphone, FileText, Send, Trash2, Users, Pin } from 'lucide-react';
import { api, buildAuthenticatedAssetUrl } from '../api';
import '../styles/Pages.css';
import '../styles/Notifications.css';

const TABS = [
  { id: 'broadcasts', label: 'Рассылки', icon: Megaphone },
  { id: 'notes', label: 'Доска объявлений', icon: FileText },
  { id: 'telegram', label: 'Telegram', icon: Users },
];

const DEFAULT_BROADCAST = {
  text: '',
  priority: 'normal',
  role: '',
  usernames: '',
};

const DEFAULT_NOTE = {
  text: '',
  is_pinned: false,
  is_highlighted: false,
};

function Notifications() {
  const [tab, setTab] = useState('broadcasts');
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [broadcastForm, setBroadcastForm] = useState(DEFAULT_BROADCAST);
  const [noteForm, setNoteForm] = useState(DEFAULT_NOTE);

  const load = async () => {
    setLoading(true);
    try {
      const overviewData = await api.get('/api/notifications/overview');
      setOverview(overviewData);
    } catch (error) {
      setMessage(`Ошибка загрузки: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const linkedUsers = overview?.linked_users || [];
  const selectedUsernames = useMemo(() => (
    broadcastForm.usernames
      .split(',')
      .map((item) => item.trim().replace(/^@+/, ''))
      .filter(Boolean)
  ), [broadcastForm.usernames]);

  const toggleLinkedUser = (username) => {
    const normalized = (username || '').replace(/^@+/, '');
    const next = selectedUsernames.includes(normalized)
      ? selectedUsernames.filter((item) => item !== normalized)
      : [...selectedUsernames, normalized];
    setBroadcastForm((prev) => ({ ...prev, usernames: next.join(', ') }));
  };

  const submitBroadcast = async (event) => {
    event.preventDefault();
    try {
      const usernames = broadcastForm.usernames
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      await api.post('/api/notifications/broadcasts', {
        text: broadcastForm.text,
        priority: broadcastForm.priority,
        filters: {
          role: broadcastForm.role || null,
          usernames,
        },
      });
      setBroadcastForm(DEFAULT_BROADCAST);
      setMessage('Рассылка сохранена в системе уведомлений.');
      load();
    } catch (error) {
      setMessage(`Ошибка рассылки: ${error.message}`);
    }
  };

  const submitNote = async (event) => {
    event.preventDefault();
    try {
      await api.post('/api/notifications/notes', noteForm);
      setNoteForm(DEFAULT_NOTE);
      setMessage('Заметка добавлена в доску объявлений.');
      load();
    } catch (error) {
      setMessage(`Ошибка заметки: ${error.message}`);
    }
  };

  const removeBroadcast = async (id) => {
    if (!window.confirm('Удалить эту рассылку?')) return;
    try {
      await api.del(`/api/notifications/broadcasts/${id}`);
      setMessage('Рассылка удалена.');
      load();
    } catch (error) {
      setMessage(`Ошибка удаления: ${error.message}`);
    }
  };

  const removeNote = async (id) => {
    if (!window.confirm('Удалить эту заметку?')) return;
    try {
      await api.del(`/api/notifications/notes/${id}`);
      setMessage('Заметка удалена.');
      load();
    } catch (error) {
      setMessage(`Ошибка удаления: ${error.message}`);
    }
  };

  if (loading) {
    return <div className="loading">Загрузка уведомлений...</div>;
  }

  return (
    <div className="page notifications-page">
      <div className="page-header">
        <div>
          <h1>Уведомления</h1>
          <p className="notifications-subtitle">
            Здесь мы управляем ручными рассылками, доской объявлений и статусом Telegram-привязки.
          </p>
        </div>
        <div className="notifications-summary">
          <div className="notifications-summary-card">
            <span>Режим</span>
            <strong>{overview?.test_mode ? 'Тестовый' : 'Боевой'}</strong>
          </div>
          <div className="notifications-summary-card">
            <span>Привязано</span>
            <strong>{overview?.linked_users_count || 0}</strong>
          </div>
          <div className="notifications-summary-card danger">
            <span>Не привязано</span>
            <strong>{overview?.unlinked_users?.length || 0}</strong>
          </div>
        </div>
      </div>

      {message && <div className="alert success">{message}</div>}

      <div className="notifications-tabs">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`notifications-tab ${tab === id ? 'active' : ''}`}
            onClick={() => setTab(id)}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'broadcasts' && (
        <section className="notifications-section">
          <form className="form" onSubmit={submitBroadcast}>
            <div className="notifications-form-head">
              <h2>Новая рассылка</h2>
              <button className="btn-primary" type="submit">
                <Send size={16} /> Сохранить рассылку
              </button>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="broadcast-text">Текст</label>
                <textarea
                  id="broadcast-text"
                  rows="5"
                  value={broadcastForm.text}
                  onChange={(e) => setBroadcastForm((prev) => ({ ...prev, text: e.target.value }))}
                  placeholder="Например: завтра в 14:00 проверьте обновленный график смен."
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="broadcast-priority">Приоритет</label>
                <select
                  id="broadcast-priority"
                  value={broadcastForm.priority}
                  onChange={(e) => setBroadcastForm((prev) => ({ ...prev, priority: e.target.value }))}
                >
                  <option value="normal">Обычный</option>
                  <option value="important">Важный</option>
                  <option value="urgent">Срочный</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="broadcast-role">Роль</label>
                <select
                  id="broadcast-role"
                  value={broadcastForm.role}
                  onChange={(e) => setBroadcastForm((prev) => ({ ...prev, role: e.target.value }))}
                >
                  <option value="">Без фильтра по роли</option>
                  <option value="volunteer">Волонтеры</option>
                  <option value="tribe_master">Трайб-мастера</option>
                  <option value="team_lead">Team Lead</option>
                  <option value="admin">Администраторы</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="broadcast-usernames">Ники Telegram</label>
                <input
                  id="broadcast-usernames"
                  value={broadcastForm.usernames}
                  onChange={(e) => setBroadcastForm((prev) => ({ ...prev, usernames: e.target.value }))}
                  placeholder="@nick1, @nick2"
                />
                <div className="notifications-recipient-picker">
                  <div className="notifications-recipient-picker-head">
                    <span>Выбрать из уже привязанных Telegram</span>
                    <small>{linkedUsers.length ? `${linkedUsers.length} человек` : 'пока никто не привязан'}</small>
                  </div>
                  <div className="notifications-recipient-list">
                    {linkedUsers.map((user) => {
                      const normalized = (user.telegram || '').replace(/^@+/, '');
                      const active = selectedUsernames.includes(normalized);
                      return (
                        <button
                          key={user.id}
                          type="button"
                          className={`notifications-recipient-chip ${active ? 'active' : ''}`}
                          onClick={() => toggleLinkedUser(user.telegram)}
                        >
                          <strong>{user.name}</strong>
                          <span>{user.telegram || `@${user.nick}`}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </form>

          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Когда</th>
                  <th>Статус</th>
                  <th>Приоритет</th>
                  <th>Фильтры</th>
                  <th>Текст</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {(overview?.broadcasts || []).length === 0 ? (
                  <tr><td className="text-center" colSpan="6">Рассылок пока нет.</td></tr>
                ) : (
                  (overview?.broadcasts || []).map((item) => (
                    <tr key={item.id}>
                      <td>{item.created_at ? new Date(item.created_at).toLocaleString('ru-RU') : '—'}</td>
                      <td>{formatBroadcastStatus(item.status)}</td>
                      <td>{formatPriority(item.priority)}</td>
                      <td>{formatFilters(item.filters)}</td>
                      <td className="notifications-text-cell">{item.text}</td>
                      <td>
                        <button className="btn-icon danger" type="button" onClick={() => removeBroadcast(item.id)}>
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'notes' && (
        <section className="notifications-section">
          <form className="form" onSubmit={submitNote}>
            <div className="notifications-form-head">
              <h2>Новая заметка на дашборд</h2>
              <button className="btn-primary" type="submit">Опубликовать заметку</button>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="note-text">Текст заметки</label>
                <textarea
                  id="note-text"
                  rows="4"
                  value={noteForm.text}
                  onChange={(e) => setNoteForm((prev) => ({ ...prev, text: e.target.value }))}
                  placeholder="Например: сегодня к 18:00 подготовить аудиторию к экзаменационной смене."
                />
              </div>
            </div>
            <div className="notifications-checkboxes">
              <label>
                <input
                  type="checkbox"
                  checked={noteForm.is_pinned}
                  onChange={(e) => setNoteForm((prev) => ({ ...prev, is_pinned: e.target.checked }))}
                />
                Закрепить сверху
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={noteForm.is_highlighted}
                  onChange={(e) => setNoteForm((prev) => ({ ...prev, is_highlighted: e.target.checked }))}
                />
                Выделить ярче
              </label>
            </div>
          </form>

          <div className="notifications-notes-grid">
            {(overview?.notes || []).length === 0 ? (
              <div className="info-section"><p className="text-muted">Заметок пока нет.</p></div>
            ) : (
              (overview?.notes || []).map((note) => (
                <article
                  key={note.id}
                  className={`notifications-note-card ${note.is_highlighted ? 'highlighted' : ''}`}
                >
                  <div className="notifications-note-head">
                    <div className="notifications-note-badges">
                      {note.is_pinned && (
                        <span className="notifications-note-badge">
                          <Pin size={14} /> Закреплено
                        </span>
                      )}
                      {note.is_highlighted && (
                        <span className="notifications-note-badge fire">
                          <Flame size={14} /> Огонек
                        </span>
                      )}
                    </div>
                    <button className="btn-icon danger" type="button" onClick={() => removeNote(note.id)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <p>{note.text}</p>
                  <small>
                    {note.author_nick ? `@${note.author_nick}` : 'система'} · {note.updated_at ? new Date(note.updated_at).toLocaleString('ru-RU') : ''}
                  </small>
                </article>
              ))
            )}
          </div>
        </section>
      )}

      {tab === 'telegram' && (
        <section className="notifications-section">
          <div className="notifications-telegram-grid">
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Ник</th>
                    <th>Имя</th>
                    <th>Роль</th>
                    <th>Telegram</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {(overview?.linked_users || []).length === 0 ? (
                    <tr><td className="text-center" colSpan="5">Пока никто не привязал Telegram.</td></tr>
                  ) : (
                    (overview?.linked_users || []).map((item) => (
                      <tr key={item.id}>
                        <td><PersonTelegramCell person={item} /></td>
                        <td>{item.name}</td>
                        <td>{formatRole(item.role)}</td>
                        <td>{item.telegram || 'не указан'}</td>
                        <td>{item.delivery_enabled ? 'привязан' : 'привязан, доставка выключена'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ник</th>
                  <th>Имя</th>
                  <th>Роль</th>
                  <th>Telegram</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {(overview?.unlinked_users || []).length === 0 ? (
                  <tr><td className="text-center" colSpan="5">Все волонтеры текущего бассейна уже привязаны к Telegram.</td></tr>
                ) : (
                  (overview?.unlinked_users || []).map((item) => (
                    <tr key={item.id}>
                      <td><PersonTelegramCell person={item} /></td>
                      <td>{item.name}</td>
                      <td>{formatRole(item.role)}</td>
                      <td>{item.telegram || 'не указан'}</td>
                      <td>{item.needs_username ? 'нужно указать username' : 'ожидает привязки'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          </div>
        </section>
      )}
    </div>
  );
}

function PersonTelegramCell({ person }) {
  return (
    <div className="notifications-person-cell">
      <span className="notifications-person-avatar">
        {person.avatar_url ? (
          <img src={buildAuthenticatedAssetUrl(person.avatar_url)} alt={person.name || person.nick} />
        ) : (
          (person.nick || '??').slice(0, 2).toUpperCase()
        )}
      </span>
      <div>
        <strong>@{person.nick}</strong>
        <div className="notifications-person-name">{person.name}</div>
      </div>
    </div>
  );
}

function formatBroadcastStatus(status) {
  const labels = {
    draft: 'черновик',
    queued: 'в очереди',
    pending: 'ожидает отправки',
    sent: 'отправлено',
    error: 'ошибка',
    cancelled: 'отменено',
    skipped: 'пропущено',
  };
  return labels[status] || status || '—';
}

function formatPriority(priority) {
  const labels = {
    normal: 'обычный',
    important: 'важный',
    urgent: 'срочный',
  };
  return labels[priority] || priority || '—';
}

function formatRole(role) {
  const labels = {
    volunteer: 'волонтер',
    tribe_master: 'трайб-мастер',
    team_lead: 'team lead',
    admin: 'администратор',
  };
  return labels[role] || role || '—';
}

function formatFilters(filters) {
  const chunks = [];
  if (filters?.role) chunks.push(`роль: ${formatRole(filters.role)}`);
  if (Array.isArray(filters?.usernames) && filters.usernames.length) {
    chunks.push(`ники: ${filters.usernames.join(', ')}`);
  }
  return chunks.join(' · ') || 'все доступные получатели';
}

export default Notifications;
