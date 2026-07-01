import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, getToken, API_URL } from '../api';
import '../styles/Manage.css';
import '../styles/Settings.css';

const ROLE_LABELS = { volunteer: 'Волонтёр', tribe_master: 'Трайб-мастер', team_lead: 'Тимлид', admin: 'Админ' };
const STATE_LABELS = { active: 'активен', ended: 'завершён', archived: 'архив' };

function Settings({ user }) {
  const location = useLocation();
  const isAdmin = user.role === 'admin';
  const [pools, setPools] = useState([]);
  const [staffUsers, setStaffUsers] = useState([]);
  const [systemVols, setSystemVols] = useState([]);
  const [msg, setMsg] = useState('');
  const [highlightedSection, setHighlightedSection] = useState('');
  const volunteerUploadRef = useRef(null);

  const loadPools = useCallback(async () => setPools(await api.get('/api/pools')), []);
  const loadStaff = useCallback(async () => {
    if (!isAdmin) return;
    const all = await api.get('/api/users');
    setStaffUsers(all.filter((u) => ['team_lead', 'admin'].includes(u.role)));
  }, [isAdmin]);
  const loadSystemVols = useCallback(async () => {
    const all = await api.get('/api/users');
    setSystemVols(all.filter((u) => ['volunteer', 'tribe_master'].includes(u.role)));
  }, []);

  useEffect(() => { loadPools(); loadStaff(); loadSystemVols(); }, [loadPools, loadStaff, loadSystemVols]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const focus = params.get('focus');
    if (focus !== 'volunteer-upload') return;
    const timer = window.setTimeout(() => {
      const node = volunteerUploadRef.current;
      if (!node) return;
      node.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setHighlightedSection('volunteer-upload');
      window.setTimeout(() => setHighlightedSection(''), 1800);
    }, 120);

    return () => window.clearTimeout(timer);
  }, [location.search]);

  const activePool = pools.find((p) => p.active);

  return (
    <div className="page manage-page">
      <h1>Настройки</h1>
      {msg && <div className="alert success">{msg}</div>}

      {/* 1. Бассейны */}
      <section className="manage-section">
        <h2>Бассейны</h2>
        {activePool
          ? <p className="muted">Активный: <strong>{activePool.name}</strong></p>
          : <p className="muted">Нет активного бассейна — создай новый или активируй существующий.</p>
        }
        <PoolForm onDone={(t) => { setMsg(t); loadPools(); }} />
        <div className="pool-list">
          {pools.map((p) => (
            <div key={p.id} className={`pool-row ${p.active ? 'active' : ''} ${p.archived ? 'archived' : ''}`}>
              <span className={`pool-state-badge state-${p.state}`}>{STATE_LABELS[p.state]}</span>
              <span className="pool-name">{p.name}{p.start_date ? ` · ${p.start_date}` : ''}</span>
              <div className="pool-actions">
                <button
                  className="btn-mini"
                  onClick={async () => {
                    const nextName = window.prompt('Новое название бассейна', p.name);
                    if (nextName === null) return;
                    const trimmed = nextName.trim();
                    if (!trimmed || trimmed === p.name) return;
                    await api.patch(`/api/pools/${p.id}`, { name: trimmed });
                    setMsg('Название бассейна обновлено');
                    loadPools();
                  }}
                >
                  <Pencil size={14} /> Переименовать
                </button>
                {!p.active && !p.archived && (
                  <button className="btn-mini primary"
                    onClick={async () => { await api.post(`/api/pools/${p.id}/activate`); loadPools(); }}>
                    Активировать
                  </button>
                )}
                {!p.archived && (
                  <button className="btn-mini danger-outline"
                    onClick={async () => {
                      if (!window.confirm(`Архивировать «${p.name}»? Волонтёры потеряют доступ.`)) return;
                      await api.post(`/api/pools/${p.id}/archive`); loadPools();
                    }}>В архив</button>
                )}
                {p.archived && (
                  <button className="btn-mini"
                    onClick={async () => { await api.post(`/api/pools/${p.id}/unarchive`); loadPools(); }}>
                    Восстановить
                  </button>
                )}
                {!p.active && (
                  <button
                    className="btn-mini danger-outline"
                    onClick={async () => {
                      if (!window.confirm(`Удалить бассейн «${p.name}»?\nЭто удалит связанные смены, волонтёров, студентов и события.`)) return;
                      await api.del(`/api/pools/${p.id}`);
                      loadPools();
                    }}
                  >
                    Удалить
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 2. Добавить тимлида/админа (только admin) */}
      {isAdmin && (
        <section className="manage-section">
          <h2>Добавить администратора / тимлида</h2>
          <UserForm onDone={(t) => { setMsg(t); loadStaff(); }} />
          <div className="user-list">
            {staffUsers.map((u) => (
              <div key={u.id} className="user-row">
                <span className="u-nick">@{u.nick}</span>
                <span className="u-name">{u.name}</span>
                <span className={`u-role role-${u.role}`}>{ROLE_LABELS[u.role]}</span>
                <button className="btn-icon danger" title="Удалить"
                  onClick={async () => {
                    if (!window.confirm(`Удалить @${u.nick}?`)) return;
                    try { await api.del(`/api/users/${u.id}`); loadStaff(); }
                    catch (e) { alert(e.message); }
                  }}><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 3. Загрузить волонтёров в систему */}
      <section
        className={`manage-section ${highlightedSection === 'volunteer-upload' ? 'manage-section-highlighted' : ''}`}
        ref={volunteerUploadRef}
      >
        <h2>Загрузить волонтёров в систему</h2>
        <p className="muted">Шаблон: Имя / Ник школьный / Ник Telegram. Роль назначается во вкладке «Волонтёры».</p>
        <GlobalVolunteerUpload onDone={(t) => { setMsg(t); loadSystemVols(); }} />
      </section>

      {/* 4. Волонтёры в системе */}
      <section className="manage-section">
        <h2>Волонтёры в системе</h2>
        {systemVols.length === 0
          ? <p className="muted">Волонтёров ещё нет. Загрузи через шаблон выше.</p>
          : <SystemVolunteersList volunteers={systemVols} onSaved={loadSystemVols} />
        }
      </section>
    </div>
  );
}

function PoolForm({ onDone }) {
  const [form, setForm] = useState({ name: '', start_date: '' });
  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    try {
      await api.post('/api/pools', form);
      setForm({ name: '', start_date: '' });
      onDone('Бассейн добавлен');
    } catch (err) { alert(err.message); }
  };
  return (
    <form className="inline-form" onSubmit={submit}>
      <input className="pool-form-name" placeholder="Название (Бассейн 08.06)" value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <input type="date" value={form.start_date}
        onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
      <button className="btn-primary" type="submit"><Plus size={16} /> Создать</button>
    </form>
  );
}

function UserForm({ onDone }) {
  const [form, setForm] = useState({ nick: '', name: '', role: 'team_lead', password: '' });
  const submit = async (e) => {
    e.preventDefault();
    if (!form.nick.trim()) return;
    try {
      await api.post('/api/users', form);
      setForm({ nick: '', name: '', role: form.role, password: '' });
      onDone(`@${form.nick} добавлен`);
    } catch (err) { alert(err.message); }
  };
  return (
    <form className="inline-form" onSubmit={submit}>
      <input placeholder="ник" value={form.nick} autoCapitalize="none"
        onChange={(e) => setForm({ ...form, nick: e.target.value })} />
      <input placeholder="имя" value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <select className="user-form-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
        <option value="team_lead">Тимлид</option>
        <option value="admin">Админ</option>
      </select>
      <input type="password" placeholder="пароль" value={form.password}
        onChange={(e) => setForm({ ...form, password: e.target.value })} />
      <button className="btn-primary" type="submit"><Plus size={16} /> Добавить</button>
    </form>
  );
}

function GlobalVolunteerUpload({ onDone }) {
  const downloadTemplate = () => {
    const token = getToken();
    window.open(`${API_URL}/api/volunteers/template?token=${token}`, '_blank');
  };
  const importFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    e.target.value = '';
    try {
      const res = await api.upload('/api/volunteers/import-file', form);
      onDone(res.message || `Готово: создано ${res.created ?? 0}, обновлено ${res.updated ?? 0}`);
    } catch (err) { alert(err.message); }
  };
  return (
    <div className="pv-toolbar">
      <button className="btn-mini" onClick={downloadTemplate}>⬇ Шаблон Excel</button>
      <label className="btn-mini primary" style={{ cursor: 'pointer' }}>
        ⬆ Загрузить Excel
        <input type="file" accept=".xlsx" style={{ display: 'none' }} onChange={importFile} />
      </label>
    </div>
  );
}

function tgLink(raw) {
  if (!raw) return null;
  const nick = raw.startsWith('@') ? raw.slice(1) : raw;
  return `https://t.me/${nick}`;
}

function SystemVolunteerRow({ volunteer, onSaved }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({
    name: volunteer.name || '',
    nick: volunteer.nick || '',
    telegram: volunteer.telegram || '',
  });
  const menuRef = useRef(null);

  useEffect(() => {
    setForm({
      name: volunteer.name || '',
      nick: volunteer.nick || '',
      telegram: volunteer.telegram || '',
    });
  }, [volunteer]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const handleClickOutside = (event) => {
      if (!menuRef.current?.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const save = async () => {
    await api.patch(`/api/volunteers/${volunteer.id}`, form);
    setEditing(false);
    onSaved();
  };

  const copyNick = async () => {
    try {
      await navigator.clipboard.writeText(`@${volunteer.nick}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch (e) {
      alert('Не удалось скопировать ник');
    }
  };

  return (
    <tr>
      <td>
        {editing ? (
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="sys-vol-input"
          />
        ) : (
          volunteer.name
        )}
      </td>
      <td className="nick-cell">
        {editing ? (
          <input
            value={form.nick}
            onChange={(e) => setForm({ ...form, nick: e.target.value.replace(/^@+/, '') })}
            className="sys-vol-input sys-vol-input-mono"
          />
        ) : (
          <button type="button" className="sys-vol-nick-button" onClick={copyNick} title="Скопировать школьный ник">
            {copied ? 'Скопировано' : `@${volunteer.nick}`}
          </button>
        )}
      </td>
      <td>
        {editing ? (
          <input
            value={form.telegram}
            onChange={(e) => setForm({ ...form, telegram: e.target.value })}
            className="sys-vol-input sys-vol-input-mono"
            placeholder="@telegram"
          />
        ) : (
          volunteer.telegram
            ? <a href={tgLink(volunteer.telegram)} target="_blank" rel="noreferrer" className="tg-link">
                {volunteer.telegram.startsWith('@') ? volunteer.telegram : `@${volunteer.telegram}`}
              </a>
            : <span className="text-muted">—</span>
        )}
      </td>
      <td className="sys-vol-actions-cell">
        {editing ? (
          <div className="sys-vol-inline-actions">
            <button type="button" className="btn-mini primary" onClick={save}>Сохранить</button>
            <button
              type="button"
              className="btn-mini"
              onClick={() => {
                setEditing(false);
                setForm({
                  name: volunteer.name || '',
                  nick: volunteer.nick || '',
                  telegram: volunteer.telegram || '',
                });
              }}
            >
              Отмена
            </button>
          </div>
        ) : (
          <div className="sys-vol-menu" ref={menuRef}>
            <button
              type="button"
              className="sys-vol-menu-trigger"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-label={`Действия для @${volunteer.nick}`}
            >
              <MoreHorizontal size={16} />
            </button>
            {menuOpen && (
              <div className="sys-vol-menu-dropdown">
                <button
                  type="button"
                  className="sys-vol-menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    setEditing(true);
                  }}
                >
                  Редактировать
                </button>
              </div>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

function SystemVolunteersList({ volunteers, onSaved }) {
  return (
    <div className="sys-vol-table-wrap">
      <table className="sys-vol-table">
        <thead>
          <tr>
            <th>Имя</th>
            <th>Ник школьный</th>
            <th>Ник Telegram</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {volunteers.map((v) => (
            <SystemVolunteerRow key={v.id} volunteer={v} onSaved={onSaved} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default Settings;
