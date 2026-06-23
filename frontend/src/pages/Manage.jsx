import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../api';
import '../styles/Manage.css';

const ROLE_LABELS = {
  team_lead: 'Тимлид',
  admin: 'Админ',
};

function Manage({ user }) {
  const isAdmin = user.role === 'admin';
  const [pools, setPools] = useState([]);
  const [users, setUsers] = useState([]);
  const [msg, setMsg] = useState('');

  const loadPools = useCallback(async () => setPools(await api.get('/api/pools')), []);
  const loadSystemUsers = useCallback(async () => {
    if (!isAdmin) return;
    const allUsers = await api.get('/api/users');
    setUsers(allUsers.filter((u) => u.role === 'team_lead' || u.role === 'admin'));
  }, [isAdmin]);

  useEffect(() => {
    loadPools();
    loadSystemUsers();
  }, [loadPools, loadSystemUsers]);

  const activePool = pools.find((p) => p.active);

  return (
    <div className="page manage-page">
      <h1>Настройка бассейна</h1>
      {msg && <div className="alert success">{msg}</div>}

      <section className="manage-section">
        <h2>Бассейны</h2>
        {activePool ? (
          <p className="muted">Активный: <strong>{activePool.name}</strong></p>
        ) : (
          <p className="muted">Активного бассейна нет — создай новый.</p>
        )}
        <PoolForm onDone={(t) => { setMsg(t); loadPools(); }} />
        <div className="pool-list">
          {pools.map((p) => (
            <div key={p.id} className={`pool-row ${p.active ? 'active' : ''}`}>
              <span>{p.name} {p.start_date ? `· старт ${p.start_date}` : ''}</span>
              {p.active ? (
                <span className="badge-confirmed">активен</span>
              ) : (
                <button className="btn-mini primary" onClick={async () => { await api.post(`/api/pools/${p.id}/activate`); loadPools(); }}>
                  сделать активным
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="manage-section">
        <h2>Стандартное расписание</h2>
        {activePool?.start_date ? (
          <>
            <p className="muted">
              Генерирует тайм-блоки по шаблону School21 pool: день открытия 09:00–19:00 (7 мест),
              Чт — экзамен 11:00–17:00 (5 мест), остальные дни — два слота 10:00–14:00 и 15:00–19:00.
            </p>
            <GenerateScheduleForm poolId={activePool.id} onDone={(t) => setMsg(t)} />
          </>
        ) : (
          <p className="muted">Создай бассейн с датой начала, чтобы сгенерировать расписание по шаблону.</p>
        )}
      </section>

      <section className="manage-section">
        <h2>Добавить тайм-блок вручную</h2>
        <p className="muted">Для разовых корректировок. Массово добавляй через шаблон выше.</p>
        <BlockForm poolId={activePool?.id} onDone={(t) => setMsg(t)} disabled={!activePool} />
      </section>

      {isAdmin && (
        <section className="manage-section">
          <h2>Админы и тимлиды</h2>
          <p className="muted">
            Здесь только системный доступ к приложению. Волонтёры, трайб-мастера, групповые и коины управляются во вкладке «Волонтёры».
          </p>
          <UserForm onDone={(t) => { setMsg(t); loadSystemUsers(); }} />
          <div className="user-list">
            {users.map((u) => (
              <div key={u.id} className="user-row">
                <span className="u-nick">@{u.nick}</span>
                <span className="u-name">{u.name}</span>
                <span className={`u-role role-${u.role}`}>{ROLE_LABELS[u.role]}</span>
                <button
                  className="btn-icon danger"
                  title="Удалить"
                  onClick={async () => {
                    if (!window.confirm(`Удалить @${u.nick}?`)) return;
                    try { await api.del(`/api/users/${u.id}`); loadSystemUsers(); }
                    catch (e) { alert(e.message); }
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
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
      onDone('Бассейн создан и сделан активным');
    } catch (err) { alert(err.message); }
  };
  return (
    <form className="inline-form" onSubmit={submit}>
      <input placeholder="Название (Бассейн 08.06)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
      <button className="btn-primary" type="submit"><Plus size={16} /> Создать</button>
    </form>
  );
}

function BlockForm({ poolId, onDone, disabled }) {
  const [form, setForm] = useState({ date: '', time_start: '10:00', time_end: '14:00', label: '' });
  const submit = async (e) => {
    e.preventDefault();
    if (!form.date) return;
    try {
      await api.post('/api/blocks', { ...form, pool_id: poolId });
      onDone('Тайм-блок добавлен');
    } catch (err) { alert(err.message); }
  };
  return (
    <form className="inline-form" onSubmit={submit}>
      <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} disabled={disabled} />
      <input type="time" value={form.time_start} onChange={(e) => setForm({ ...form, time_start: e.target.value })} disabled={disabled} />
      <input type="time" value={form.time_end} onChange={(e) => setForm({ ...form, time_end: e.target.value })} disabled={disabled} />
      <input placeholder="метка (EXAM)" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} disabled={disabled} />
      <button className="btn-primary" type="submit" disabled={disabled}><Plus size={16} /> Блок</button>
    </form>
  );
}

function UserForm({ onDone }) {
  const roles = ['team_lead', 'admin'];
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
      <input placeholder="ник" value={form.nick} autoCapitalize="none" onChange={(e) => setForm({ ...form, nick: e.target.value })} />
      <input placeholder="имя" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
        {roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
      </select>
      <input type="password" placeholder="пароль" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      <button className="btn-primary" type="submit"><Plus size={16} /> Добавить</button>
    </form>
  );
}

function GenerateScheduleForm({ poolId, onDone }) {
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!endDate) return;
    if (!window.confirm('Добавить стандартное расписание? Существующие блоки не удаляются.')) return;
    setLoading(true);
    try {
      const res = await api.post(`/api/pools/${poolId}/generate-schedule`, { end_date: endDate });
      onDone(res.message || 'Расписание создано');
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };
  const undo = async () => {
    if (!window.confirm('Отменить последнюю генерацию стандартного расписания? Записи волонтёров на эти блоки тоже удалятся.')) return;
    setUndoing(true);
    try {
      const res = await api.post(`/api/pools/${poolId}/generate-schedule/undo`, {});
      onDone(res.message || 'Последняя генерация отменена');
    } catch (err) {
      alert(err.message);
    } finally {
      setUndoing(false);
    }
  };
  return (
    <div className="schedule-generator">
      <form className="inline-form" onSubmit={submit}>
        <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Дата окончания бассейна:</label>
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        <button className="btn-primary" type="submit" disabled={loading}>
          <Plus size={16} /> {loading ? 'Создаю...' : 'Сгенерировать'}
        </button>
      </form>
      <button className="btn-secondary" type="button" onClick={undo} disabled={undoing}>
        {undoing ? 'Отменяю...' : 'Отменить последнюю генерацию'}
      </button>
    </div>
  );
}

export default Manage;
