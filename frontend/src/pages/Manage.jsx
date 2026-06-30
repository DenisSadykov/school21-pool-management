import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Settings, Trash2 } from 'lucide-react';
import { api } from '../api';
import TribeLabel from '../components/TribeLabel';
import '../styles/Manage.css';

function Manage({ user }) {
  const [pools, setPools] = useState([]);
  const [allVolunteers, setAllVolunteers] = useState([]);
  const [tribes, setTribes] = useState([]);
  const [msg, setMsg] = useState('');

  const loadPools = useCallback(async () => setPools(await api.get('/api/pools')), []);
  const loadVolunteers = useCallback(async () => {
    const all = await api.get('/api/users');
    setAllVolunteers(all.filter((u) => ['volunteer', 'tribe_master'].includes(u.role)));
  }, []);
  const loadTribes = useCallback(async () => setTribes(await api.get('/api/tribes')), []);

  useEffect(() => {
    loadPools();
    loadVolunteers();
    loadTribes();
  }, [loadPools, loadVolunteers, loadTribes]);

  const activePool = pools.find((p) => p.active);

  return (
    <div className="page manage-page">
      <h1>Настройки бассейна</h1>
      {msg && <div className="alert success">{msg}</div>}

      {!activePool ? (
        <div className="empty-state">
          <p>Нет активного бассейна.</p>
          <Link to="/settings" className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Settings size={16} /> Перейти в Настройки
          </Link>
        </div>
      ) : (
        <>
          <section className="manage-section">
            <h2>Стандартное расписание</h2>
            {activePool.start_date ? (
              <>
                <p className="muted">
                  Генерирует 14-дневный шаблон School21 pool: стартовый понедельник 09:00–19:00 и 19:00–20:00,
                  по четвергам — EXAM 11:00–17:00, остальные дни — слоты 10:00–14:00 и 15:00–19:00.
                </p>
                <GenerateScheduleForm poolId={activePool.id} onDone={(t) => setMsg(t)} />
              </>
            ) : (
              <p className="muted">У активного бассейна не задана дата начала. Укажи её в <Link to="/settings">Настройках</Link>.</p>
            )}
          </section>

          <section className="manage-section">
            <h2>Волонтёры бассейна</h2>
            <p className="muted">Назначь волонтёров из системы или загрузи Excel.</p>
            <PoolVolunteersSection
              poolId={activePool.id}
              allVolunteers={allVolunteers}
              onChanged={loadVolunteers}
            />
          </section>

          <section className="manage-section">
            <h2>Трайбы</h2>
            <TribesSection tribes={tribes} onChanged={loadTribes} />
          </section>
        </>
      )}
    </div>
  );
}

function GenerateScheduleForm({ poolId, onDone }) {
  const [loading, setLoading] = useState(false);
  const [undoing, setUndoing] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!window.confirm('Сгенерировать стандартный бассейн на 14 дней? Существующие блоки не удаляются.')) return;
    setLoading(true);
    try {
      const res = await api.post(`/api/pools/${poolId}/generate-schedule`, {});
      onDone(res.message || 'Расписание создано');
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const undo = async () => {
    if (!window.confirm('Отменить последнюю генерацию? Записи волонтёров на эти блоки тоже удалятся.')) return;
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
        <button className="btn-primary" type="submit" disabled={loading}>
          <Plus size={16} /> {loading ? 'Создаю...' : 'Сгенерировать бассейн на 14 дней'}
        </button>
      </form>
      <button className="btn-secondary" type="button" onClick={undo} disabled={undoing}>
        {undoing ? 'Отменяю...' : 'Отменить последнюю генерацию'}
      </button>
    </div>
  );
}

function PoolVolunteersSection({ poolId, allVolunteers, onChanged }) {
  const [pvs, setPvs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addUserId, setAddUserId] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setPvs(await api.get(`/api/pools/${poolId}/volunteers`)); }
    finally { setLoading(false); }
  }, [poolId]);

  useEffect(() => { load(); }, [load]);

  const assignedIds = new Set(pvs.map((v) => v.id));
  const available = allVolunteers.filter((v) => !assignedIds.has(v.id));

  const add = async () => {
    if (!addUserId) return;
    try {
      await api.post(`/api/pools/${poolId}/volunteers`, { user_ids: [Number(addUserId)] });
      setAddUserId('');
      setMsg('Добавлено');
      load();
      onChanged();
    } catch (e) { alert(e.message); }
  };

  const remove = async (v) => {
    if (!window.confirm(`Удалить @${v.nick} из бассейна? Их смены будут очищены.`)) return;
    try {
      await api.del(`/api/pools/${poolId}/volunteers/${v.id}`);
      setMsg('Удалено');
      load();
      onChanged();
    } catch (e) { alert(e.message); }
  };

  return (
    <div className="pool-volunteers-section" style={{ border: 'none', padding: 0, borderRadius: 0 }}>
      {msg && <div className="pv-msg">{msg}</div>}
      <div className="pv-toolbar">
        <Link to="/settings?focus=volunteer-upload" className="btn-mini" style={{ textDecoration: 'none' }}>
          ⬆ Загрузить волонтёров в систему
        </Link>
        <div className="pv-add-row">
          <select value={addUserId} onChange={(e) => setAddUserId(e.target.value)}>
            <option value="">Добавить из системы</option>
            {available.map((v) => (
              <option key={v.id} value={v.id}>
                @{v.nick} {v.name ? `· ${v.name}` : ''}
              </option>
            ))}
          </select>
          <button className="btn-mini primary" onClick={add} disabled={!addUserId}>+</button>
        </div>
      </div>
      {loading ? (
        <p className="pv-empty">Загрузка…</p>
      ) : pvs.length === 0 ? (
        <p className="pv-empty">Волонтёры не назначены.</p>
      ) : (
        <div className="pv-list" style={{ marginTop: 8 }}>
          <div className="pv-head">
            <span>Ник</span>
            <span>Имя</span>
            <span>Телеграм</span>
            <span>Удалить</span>
          </div>
          {pvs.map((v) => (
            <div key={v.id} className="pv-row">
              <span className="pv-nick">@{v.nick}</span>
              <span className="pv-name">{v.name || '—'}</span>
              <span className="pv-tg">{v.telegram || '—'}</span>
              <button className="btn-icon danger pv-del" onClick={() => remove(v)} title="Удалить из бассейна">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TribesSection({ tribes, onChanged }) {
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');

  const add = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await api.post('/api/tribes', { name: name.trim() });
      setName('');
      setMsg('');
      onChanged();
    } catch (err) { setMsg(err.message); }
  };

  const loadStandard = async () => {
    try {
      const res = await api.post('/api/tribes/load-standard', {});
      setMsg(res.message);
      onChanged();
    } catch (err) { setMsg(err.message); }
  };

  const remove = async (tribe) => {
    if (!window.confirm(`Удалить трайб «${tribe.name}»?`)) return;
    try { await api.del(`/api/tribes/${tribe.id}`); onChanged(); }
    catch (err) { alert(err.message); }
  };

  return (
    <div>
      {msg && <p className="pv-msg">{msg}</p>}
      <div className="pv-toolbar" style={{ marginBottom: 10 }}>
        <form className="inline-form" onSubmit={add} style={{ margin: 0 }}>
          <input
            placeholder="Название трайба"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button className="btn-primary" type="submit"><Plus size={15} /> Добавить</button>
        </form>
        <button className="btn-mini" onClick={loadStandard}>
          Загрузить стандартные (НН)
        </button>
      </div>
      {tribes.length === 0 ? (
        <p className="pv-empty">Трайбы не добавлены.</p>
      ) : (
        <div className="pv-list">
          {tribes.map((t) => (
            <div key={t.id} className="tribe-manage-row">
              <span className="tribe-manage-name"><TribeLabel tribe={t.name} size={16} /></span>
              <button className="btn-icon danger pv-del" onClick={() => remove(t)} title="Удалить">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Manage;
