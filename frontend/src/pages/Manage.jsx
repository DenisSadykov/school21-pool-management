import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Plus, RefreshCw, Settings, Trash2 } from 'lucide-react';
import { api } from '../api';
import AuthenticatedImage from '../components/AuthenticatedImage';
import TribeLabel from '../components/TribeLabel';
import '../styles/Manage.css';

function Manage({ user }) {
  const [activePool, setActivePool] = useState(null);
  const [allVolunteers, setAllVolunteers] = useState([]);
  const [allStaff, setAllStaff] = useState([]);
  const [tribes, setTribes] = useState([]);
  const [msg, setMsg] = useState('');

  const loadActivePool = useCallback(async () => {
    setActivePool(await api.get('/api/pools/active'));
  }, []);
  const loadVolunteers = useCallback(async () => {
    const all = await api.get('/api/users');
    setAllVolunteers(all.filter((u) => ['volunteer', 'tribe_master'].includes(u.role)));
    setAllStaff(all.filter((u) => ['team_lead', 'admin'].includes(u.role)));
  }, []);
  const loadTribes = useCallback(async () => {
    if (!activePool?.id) {
      setTribes([]);
      return;
    }
    setTribes(await api.get(`/api/tribes?pool_id=${activePool.id}`));
  }, [activePool?.id]);

  useEffect(() => {
    loadActivePool();
    loadVolunteers();
  }, [loadActivePool, loadVolunteers]);

  useEffect(() => {
    loadTribes();
  }, [loadTribes]);

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
                <GenerateScheduleForm pool={activePool} onDone={async (t) => {
                  setMsg(t);
                  await loadActivePool();
                }} />
              </>
            ) : (
              <p className="muted">У активного бассейна не задана дата начала. Укажи её в <Link to="/settings">Настройках</Link>.</p>
            )}
          </section>

          <section className="manage-section">
            <h2>Автовыгрузка в Google Sheets</h2>
            <p className="muted">
              Платформа обновляет состав volunteers, смены, пенальти и трайб-мероприятия, сохраняя оформление таблицы.
            </p>
            <GoogleSheetsExportSection poolId={activePool.id} />
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
            <h2>Ответственные за бассейн</h2>
            <p className="muted">Добавь админов и тимлидов, которые отвечают за этот бассейн.</p>
            <PoolResponsiblesSection
              poolId={activePool.id}
              allStaff={allStaff}
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

function GoogleSheetsExportSection({ poolId }) {
  const [settings, setSettings] = useState(null);
  const [sheetUrl, setSheetUrl] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState('');

  const applyConnectionState = useCallback((data) => {
    setSettings(data);
    setSheetUrl(data.sheet_url || '');
    setWebhookUrl(data.webhook_url || '');
    setEnabled(Boolean(data.enabled));
  }, []);

  const load = useCallback(async () => {
    const data = await api.get(`/api/pools/${poolId}/google-sheets`);
    applyConnectionState(data);
  }, [applyConnectionState, poolId]);

  useEffect(() => {
    load().catch((error) => setMessage(error.message));
  }, [load]);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const data = await api.patch(`/api/pools/${poolId}/google-sheets`, {
        sheet_url: sheetUrl.trim(),
        webhook_url: webhookUrl.trim(),
        enabled,
      });
      applyConnectionState(data);
      setMessage('Настройки сохранены');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  };

  const exportNow = async () => {
    if (!window.confirm('Полная выгрузка заменит состав volunteers, смены, пенальти и мероприятия данными активного бассейна. Продолжить?')) {
      return;
    }
    setExporting(true);
    setMessage('');
    try {
      const data = await api.post(`/api/pools/${poolId}/google-sheets/export`, {});
      applyConnectionState(data);
      const warningText = data.warnings?.length ? ` Предупреждения: ${data.warnings.join(' · ')}` : '';
      setMessage(warningText ? `${data.message}. ${warningText.trim()}` : data.message);
    } catch (error) {
      setMessage(error.message);
      await load().catch(() => {});
    } finally {
      setExporting(false);
    }
  };

  if (!settings) return <p className="pv-empty">Загрузка...</p>;

  return (
    <div className="google-sheets-export">
      <form className="google-sheets-export-form" onSubmit={save}>
        <label>
          <span>Ссылка на таблицу</span>
          <input
            type="url"
            placeholder="https://docs.google.com/spreadsheets/d/..."
            value={sheetUrl}
            onChange={(event) => setSheetUrl(event.target.value)}
          />
        </label>
        <label>
          <span>URL Apps Script</span>
          <input
            type="url"
            placeholder="https://script.google.com/macros/s/.../exec"
            value={webhookUrl}
            onChange={(event) => setWebhookUrl(event.target.value)}
          />
        </label>
        <label className="google-sheets-toggle">
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
          <span>Обновлять автоматически каждые 5 минут</span>
        </label>
        <div className="google-sheets-actions">
          <button className="btn-primary" type="submit" disabled={saving}>
            {saving ? 'Сохраняю...' : 'Сохранить подключение'}
          </button>
          <button className="btn-secondary" type="button" onClick={exportNow} disabled={!settings.webhook_url || exporting}>
            <RefreshCw size={15} /> {exporting ? 'Обновляю...' : 'Обновить сейчас'}
          </button>
          {sheetUrl && (
            <a className="btn-secondary" href={sheetUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={15} /> Открыть таблицу
            </a>
          )}
        </div>
      </form>
      <div className="google-sheets-status">
        <span className={settings.enabled ? 'is-enabled' : ''}>{settings.enabled ? 'Автовыгрузка включена' : 'Автовыгрузка выключена'}</span>
        <span>Последнее обновление: {settings.last_export_at ? new Date(settings.last_export_at).toLocaleString('ru-RU') : 'ещё не выполнялось'}</span>
        {settings.last_error && <span className="is-error">Ошибка: {settings.last_error}</span>}
      </div>
      {message && <div className="pv-msg">{message}</div>}
    </div>
  );
}

function SmallAvatar({ person }) {
  return (
    <span className="manage-avatar">
      {person.avatar_url ? (
        <AuthenticatedImage src={person.avatar_url} alt={person.name || person.nick} />
      ) : (
        (person.nick || '??').slice(0, 2).toUpperCase()
      )}
    </span>
  );
}

function GenerateScheduleForm({ pool, onDone }) {
  const [loading, setLoading] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const poolId = pool?.id;

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
      {pool?.has_schedule_generation && (
        <div className="schedule-generator-notice">
          Расписание этого бассейна уже генерировалось ранее.
        </div>
      )}
      <form className="inline-form schedule-generator-actions" onSubmit={submit}>
        <button className="btn-primary" type="submit" disabled={loading}>
          <Plus size={16} /> {loading ? 'Создаю...' : 'Сгенерировать бассейн на 14 дней'}
        </button>
        <button className="btn-secondary" type="button" onClick={undo} disabled={undoing}>
          {undoing ? 'Отменяю...' : 'Отменить последнюю генерацию'}
        </button>
      </form>
    </div>
  );
}

function PoolVolunteersSection({ poolId, allVolunteers, onChanged }) {
  const [pvs, setPvs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addUserId, setAddUserId] = useState('');
  const [msg, setMsg] = useState('');
  const [invite, setInvite] = useState(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteMaxUses, setInviteMaxUses] = useState('');
  const [inviteExpiresAt, setInviteExpiresAt] = useState('');

  const load = useCallback(async ({ showLoading = false } = {}) => {
    if (showLoading) {
      setLoading(true);
    }
    try { setPvs(await api.get(`/api/pools/${poolId}/volunteers`)); }
    finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, [poolId]);

  useEffect(() => { load({ showLoading: true }); }, [load]);

  const loadInvite = useCallback(async () => {
    try {
      const data = await api.get(`/api/pools/${poolId}/invite-link`);
      setInvite(data.invite || null);
    } catch (error) {
      setInvite(null);
    }
  }, [poolId]);

  useEffect(() => { loadInvite(); }, [loadInvite]);

  useEffect(() => {
    setInviteMaxUses(invite?.max_uses ? String(invite.max_uses) : '');
    setInviteExpiresAt(invite?.expires_at ? invite.expires_at.slice(0, 16) : '');
  }, [invite]);

  const assignedIds = new Set(pvs.map((v) => v.id));
  const available = allVolunteers.filter((v) => !assignedIds.has(v.id));
  const inviteUrl = invite?.invite_url ? `${window.location.origin}${invite.invite_url}` : '';

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

  const refreshInvite = async () => {
    setInviteLoading(true);
    try {
      const data = await api.post(`/api/pools/${poolId}/invite-link`, {
        max_uses: inviteMaxUses.trim() ? Number(inviteMaxUses) : null,
        expires_at: inviteExpiresAt || null,
      });
      setInvite(data.invite);
      setMsg('Инвайт-ссылка обновлена');
    } catch (error) {
      alert(error.message);
    } finally {
      setInviteLoading(false);
    }
  };

  const disableInvite = async () => {
    if (!invite || !invite.is_active) return;
    if (!window.confirm('Отключить инвайт-ссылку для этого бассейна?')) return;
    setInviteLoading(true);
    try {
      await api.del(`/api/pools/${poolId}/invite-link`);
      setInvite((prev) => (prev ? { ...prev, is_active: false } : prev));
      setMsg('Инвайт-ссылка отключена');
    } catch (error) {
      alert(error.message);
    } finally {
      setInviteLoading(false);
    }
  };

  const copyInvite = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setMsg('Ссылка скопирована');
    } catch (error) {
      alert('Не удалось скопировать ссылку');
    }
  };

  return (
    <div className="pool-volunteers-section" style={{ border: 'none', padding: 0, borderRadius: 0 }}>
      {msg && <div className="pv-msg">{msg}</div>}
      <div className="pool-invite-box">
        <div className="pool-invite-meta">
          <strong>Инвайт-ссылка на бассейн</strong>
          <span>
            {inviteUrl
              ? (
                invite?.is_available
                  ? `Использований: ${invite?.uses_count || 0}${invite?.remaining_uses !== null ? ` · Осталось: ${invite.remaining_uses}` : ''}`
                  : invite?.is_expired
                    ? 'Ссылка истекла'
                    : invite?.is_limit_reached
                      ? 'Лимит входов исчерпан'
                      : 'Ссылка отключена'
              )
              : 'Лимит входов и срок действия необязательны'}
          </span>
        </div>
        <div className="pool-invite-controls">
          <input
            className="pool-invite-url"
            type="text"
            readOnly
            value={inviteUrl || 'Нажми «Создать ссылку», чтобы открыть доступ по приглашению'}
          />
          <input
            className="pool-invite-limit"
            type="number"
            min="1"
            inputMode="numeric"
            placeholder="Лимит входов"
            value={inviteMaxUses}
            onChange={(e) => setInviteMaxUses(e.target.value)}
          />
          <input
            className="pool-invite-expiry"
            type="datetime-local"
            value={inviteExpiresAt}
            onChange={(e) => setInviteExpiresAt(e.target.value)}
          />
          <div className="pool-invite-actions">
          <button className="btn-mini" type="button" onClick={refreshInvite} disabled={inviteLoading}>
            {invite ? 'Обновить ссылку' : 'Создать ссылку'}
          </button>
          <button className="btn-mini" type="button" onClick={copyInvite} disabled={!inviteUrl}>
            Копировать
          </button>
          <button
            className="btn-mini danger-outline"
            type="button"
            onClick={disableInvite}
            disabled={!invite || !invite.is_active || inviteLoading}
          >
            Отключить
          </button>
          </div>
        </div>
      </div>
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
              <span className="pv-nick"><SmallAvatar person={v} />@{v.nick}</span>
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

function PoolResponsiblesSection({ poolId, allStaff }) {
  const [responsibles, setResponsibles] = useState([]);
  const [addUserId, setAddUserId] = useState('');
  const [msg, setMsg] = useState('');
  const [savingNotificationsFor, setSavingNotificationsFor] = useState(null);

  const load = useCallback(async () => {
    setResponsibles(await api.get(`/api/pools/${poolId}/responsibles`));
  }, [poolId]);

  useEffect(() => { load(); }, [load]);

  const assignedIds = new Set(responsibles.map((item) => item.id));
  const available = allStaff.filter((item) => !assignedIds.has(item.id));

  const add = async () => {
    if (!addUserId) return;
    try {
      await api.post(`/api/pools/${poolId}/responsibles`, { user_id: Number(addUserId) });
      setAddUserId('');
      setMsg('Ответственный добавлен');
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  const remove = async (person) => {
    if (!window.confirm(`Убрать @${person.nick} из ответственных?`)) return;
    try {
      await api.del(`/api/pools/${poolId}/responsibles/${person.id}`);
      setMsg('Ответственный удалён');
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  const toggleNotifications = async (person) => {
    const enabled = person.notifications_enabled === false;
    setSavingNotificationsFor(person.id);
    try {
      const result = await api.patch(
        `/api/pools/${poolId}/responsibles/${person.id}/notifications`,
        { enabled },
      );
      setResponsibles((current) => current.map((item) => (
        item.id === person.id
          ? { ...item, notifications_enabled: result.notifications_enabled }
          : item
      )));
      setMsg(result.message);
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingNotificationsFor(null);
    }
  };

  return (
    <div className="pool-volunteers-section" style={{ border: 'none', padding: 0, borderRadius: 0 }}>
      {msg && <div className="pv-msg">{msg}</div>}
      <div className="pv-toolbar responsibles-toolbar">
        <div className="pv-add-row responsibles-add-row">
          <select value={addUserId} onChange={(e) => setAddUserId(e.target.value)}>
            <option value="">Добавить ответственного</option>
            {available.map((person) => (
              <option key={person.id} value={person.id}>
                @{person.nick} {person.name ? `· ${person.name}` : ''} · {person.role === 'admin' ? 'Админ' : 'Тимлид'}
              </option>
            ))}
          </select>
          <button className="btn-mini primary" onClick={add} disabled={!addUserId}>
            <Plus size={14} /> Добавить
          </button>
        </div>
      </div>
      {responsibles.length === 0 ? (
        <p className="pv-empty">Ответственные пока не назначены.</p>
      ) : (
        <div className="pv-list responsibles-list" style={{ marginTop: 8 }}>
          <div className="pv-head responsibles-head">
            <span>Ник</span>
            <span>Имя</span>
            <span>Телеграм</span>
            <span>Роль</span>
            <span>Уведомления</span>
            <span>Удалить</span>
          </div>
          {responsibles.map((person) => (
            <div key={person.id} className="pv-row responsibles-row">
              <span className="pv-nick"><SmallAvatar person={person} />@{person.nick}</span>
              <span className="pv-name">{person.name || '—'}</span>
              <span className="pv-tg">{person.telegram || '—'}</span>
              <span className="pv-role">{person.role === 'admin' ? 'Админ' : 'Тимлид'}</span>
              <span className="pv-notifications">
                <button
                  type="button"
                  className="responsible-notification-toggle"
                  role="switch"
                  aria-checked={person.notifications_enabled !== false}
                  aria-label={`Уведомления для @${person.nick}`}
                  title={person.notifications_enabled !== false ? 'Уведомления включены' : 'Уведомления выключены'}
                  disabled={savingNotificationsFor === person.id}
                  onClick={() => toggleNotifications(person)}
                >
                  <span aria-hidden="true" />
                </button>
              </span>
              <button className="btn-icon danger pv-del" onClick={() => remove(person)} title="Убрать из ответственных">
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
      <div className="pv-toolbar tribe-toolbar" style={{ marginBottom: 10 }}>
        <form className="inline-form tribe-toolbar-form" onSubmit={add} style={{ margin: 0 }}>
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
