import React, { useEffect, useState, useCallback } from 'react';
import { UserPlus, UserMinus, Trash2, Plus } from 'lucide-react';
import { api } from '../api';
import '../styles/Schedule.css';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function formatDay(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

function toIso(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getMonday(iso) {
  const d = new Date(iso + 'T00:00:00');
  const mondayOffset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - mondayOffset);
  return d;
}

function groupWeeks(days, tribeEvents = []) {
  const byDate = new Map(days.map((day) => [day.date, day.blocks]));
  const eventsByDate = new Map();
  tribeEvents.forEach((event) => {
    eventsByDate.set(event.date, [...(eventsByDate.get(event.date) || []), event]);
  });
  const weekStarts = [...new Set(days.map((day) => toIso(getMonday(day.date))))].sort();

  return weekStarts.map((weekStart) => {
    const start = new Date(weekStart + 'T00:00:00');
    const weekDays = WEEKDAYS.map((label, index) => {
      const date = toIso(addDays(start, index));
      const blocks = [...(byDate.get(date) || [])].sort((a, b) => a.time_start.localeCompare(b.time_start));
      const events = [...(eventsByDate.get(date) || [])].sort((a, b) => (a.time_start || '').localeCompare(b.time_start || ''));
      return { date, label, blocks, events };
    });
    const maxRows = Math.max(2, ...weekDays.map((day) => day.blocks.length));
    return { start: weekStart, days: weekDays, maxRows };
  });
}

function Schedule({ user }) {
  const [data, setData] = useState({ pool: null, days: [] });
  const [tribeEvents, setTribeEvents] = useState([]);
  const [volunteers, setVolunteers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const isStaff = user.role === 'team_lead' || user.role === 'admin';

  const load = useCallback(async () => {
    try {
      const [res, events, people] = await Promise.all([
        api.get('/api/schedule'),
        api.get(`/api/tribe-events?start=${toIso(new Date())}`),
        isStaff ? api.get('/api/volunteers') : Promise.resolve([]),
      ]);
      setData(res);
      setTribeEvents(events);
      setVolunteers(people);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [isStaff]);

  useEffect(() => {
    load();
  }, [load]);

  const isMine = (block) => block.volunteers.some((v) => v.user_id === user.id);

  const toggleSignup = async (block) => {
    try {
      if (isMine(block)) {
        await api.del(`/api/blocks/${block.id}/signup`);
      } else {
        await api.post(`/api/blocks/${block.id}/signup`);
      }
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  const removeVolunteer = async (block, v) => {
    if (!window.confirm(`Снять @${v.nick} со смены?`)) return;
    try {
      await api.del(`/api/blocks/${block.id}/signup?user_id=${v.user_id}`);
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  const deleteBlock = async (block) => {
    if (!window.confirm('Удалить этот тайм-блок со всеми записями?')) return;
    try {
      await api.del(`/api/blocks/${block.id}`);
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  const changeCapacity = async (blockId, delta) => {
    try {
      await api.patch(`/api/blocks/${blockId}/capacity`, { delta });
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  const assignVolunteer = async (block, userId) => {
    if (!userId) return;
    try {
      await api.post(`/api/blocks/${block.id}/signup`, { user_id: Number(userId) });
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  if (loading) return <div className="loading">Загрузка графика...</div>;
  if (error) return <div className="page"><div className="error-message">{error}</div></div>;

  if (!data.pool) {
    return (
      <div className="page">
        <h1>График смен</h1>
        <div className="empty-state">
          <p>Активного бассейна пока нет.</p>
          {isStaff && <p>Создай его в разделе «Настройка».</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="page schedule-page">
      {data.days.length === 0 ? (
        <div className="empty-state">
          <p>Тайм-блоков пока нет.</p>
          {isStaff && <p>Добавь их в разделе «Настройка».</p>}
        </div>
      ) : (
        <div className="schedule-weeks">
          {groupWeeks(data.days, tribeEvents).map((week) => (
            <div key={week.start} className="week-table">
              <div className="week-header-row">
                {week.days.map((day) => (
                  <div key={day.date} className="day-header">
                    <span>{day.label}</span>
                    <span>{formatDay(day.date)}</span>
                  </div>
                ))}
              </div>

              <div className="week-events-row">
                {week.days.map((day) => (
                  <div key={`${day.date}-events`} className="week-cell">
                    {day.events.length > 0 ? (
                      <div className="tribe-events-in-day">
                        {day.events.map((event) => (
                          <div className="tribe-event-chip" key={event.id}>
                            <span>Трайб {event.tribe}</span>
                            <strong>{event.time_start ? `${event.time_start} · ` : ''}{event.title}</strong>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-event-row">—</div>
                    )}
                  </div>
                ))}
              </div>

              {Array.from({ length: week.maxRows }).map((_, rowIndex) => (
                <div key={rowIndex} className="week-block-row">
                  {week.days.map((day) => {
                    const block = day.blocks[rowIndex];
                    return (
                      <div key={`${day.date}-${rowIndex}`} className="week-cell">
                        {block ? (
                          <BlockCard
                            block={block}
                            user={user}
                            isStaff={isStaff}
                            isMine={isMine}
                            onToggleSignup={toggleSignup}
                            onRemoveVolunteer={removeVolunteer}
                            onDeleteBlock={deleteBlock}
                            onChangeCapacity={changeCapacity}
                            volunteers={volunteers}
                            onAssignVolunteer={assignVolunteer}
                          />
                        ) : (
                          <div className="empty-block">—</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}

              {isStaff && (
                <div className="week-add-row">
                  {week.days.map((day) => (
                    <div key={day.date} className="week-cell">
                      <AddBlock date={day.date} poolId={data.pool.id} onAdded={load} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BlockCard({
  block,
  user,
  isStaff,
  isMine,
  onToggleSignup,
  onRemoveVolunteer,
  onDeleteBlock,
  onChangeCapacity,
  volunteers,
  onAssignVolunteer,
}) {
  const mine = isMine(block);
  const full = block.capacity != null && block.count >= block.capacity;
  const [assignUserId, setAssignUserId] = useState('');
  const assignedIds = new Set(block.volunteers.map((v) => v.user_id));
  const availableVolunteers = (volunteers || []).filter((v) => !assignedIds.has(v.id));

  return (
    <div className={`block-card ${block.label === 'EXAM' ? 'exam' : ''}`}>
      <div className="block-time">
        <span>{block.time_start}–{block.time_end}</span>
        {block.label ? <span className="block-label">{block.label}</span> : null}
        <div className="block-time-right">
          <span className="block-capacity">
            {block.capacity != null ? `${block.count} из ${block.capacity}` : block.count}
          </span>
          {isStaff && (
            <button className="cap-plus" onClick={() => onChangeCapacity(block.id, -1)} title="-1 место">−</button>
          )}
          {isStaff && (
            <button className="cap-plus" onClick={() => onChangeCapacity(block.id, 1)} title="+1 место">+</button>
          )}
          {isStaff && (
            <button className="block-del" onClick={() => onDeleteBlock(block)} title="Удалить блок">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="block-vols">
        {block.volunteers.length === 0 ? (
          <span className="block-empty">— свободно —</span>
        ) : (
          block.volunteers.map((v) => (
            <span key={v.user_id} className={`vol-chip ${v.user_id === user.id ? 'me' : ''}`}>
              @{v.nick}
              {isStaff && (
                <button className="chip-x" onClick={() => onRemoveVolunteer(block, v)} title="Снять">
                  ×
                </button>
              )}
            </span>
          ))
        )}
      </div>

      {isStaff && (
        <div className="assign-volunteer">
          <select value={assignUserId} onChange={(e) => setAssignUserId(e.target.value)}>
            <option value="">Добавить волонтёра</option>
            {availableVolunteers.map((v) => (
              <option key={v.id} value={v.id}>
                @{v.nick}{v.telegram ? ` · ${v.telegram}` : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              onAssignVolunteer(block, assignUserId);
              setAssignUserId('');
            }}
            disabled={!assignUserId || full}
          >
            +
          </button>
        </div>
      )}

      <button
        className={`block-signup ${mine ? 'leave' : ''}`}
        onClick={() => onToggleSignup(block)}
        disabled={!mine && full}
      >
        {mine ? (
          <>
            <UserMinus size={16} /> Отписаться
          </>
        ) : full ? (
          'Мест нет'
        ) : (
          <>
            <UserPlus size={16} /> Записаться
          </>
        )}
      </button>
    </div>
  );
}

function AddBlock({ date, poolId, onAdded }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ time_start: '10:00', time_end: '14:00', label: '' });

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/blocks', { ...form, date, pool_id: poolId });
      setOpen(false);
      onAdded();
    } catch (err) {
      alert(err.message);
    }
  };

  if (!open) {
    return (
      <button className="add-block-btn" onClick={() => setOpen(true)}>
        <Plus size={14} /> блок
      </button>
    );
  }

  return (
    <form className="add-block-form" onSubmit={submit}>
      <input type="time" value={form.time_start} onChange={(e) => setForm({ ...form, time_start: e.target.value })} />
      <input type="time" value={form.time_end} onChange={(e) => setForm({ ...form, time_end: e.target.value })} />
      <input type="text" placeholder="метка (EXAM)" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
      <div className="add-block-actions">
        <button type="submit" className="btn-mini primary">OK</button>
        <button type="button" className="btn-mini" onClick={() => setOpen(false)}>×</button>
      </div>
    </form>
  );
}

export default Schedule;
