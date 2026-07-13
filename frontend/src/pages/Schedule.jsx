import React, { useEffect, useState, useCallback } from 'react';
import { UserPlus, UserMinus, Trash2, Plus } from 'lucide-react';
import { api } from '../api';
import Loader from '../components/Loader';
import useIsMobile from '../useIsMobile';
import { moscowTodayIso } from '../utils/date';
import '../styles/Pages.css';
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

function todayIso() {
  return moscowTodayIso();
}

function getMonday(iso) {
  const d = new Date(iso + 'T00:00:00');
  const mondayOffset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - mondayOffset);
  return d;
}

function groupWeeks(days) {
  const byDate = new Map(days.map((day) => [day.date, day.blocks]));
  const weekStarts = [...new Set(days.map((day) => toIso(getMonday(day.date))))].sort();

  return weekStarts.map((weekStart) => {
    const start = new Date(weekStart + 'T00:00:00');
    const weekDays = WEEKDAYS.map((label, index) => {
      const date = toIso(addDays(start, index));
      const blocks = [...(byDate.get(date) || [])].sort((a, b) => a.time_start.localeCompare(b.time_start));
      return { date, label, blocks };
    });
    const maxRows = Math.max(2, ...weekDays.map((day) => day.blocks.length));
    return { start: weekStart, days: weekDays, maxRows };
  });
}

function groupDaysMobile(days, currentDay, isStaff) {
  const sorted = [...days]
    .map((day) => ({
      ...day,
      blocks: [...day.blocks].sort((a, b) => a.time_start.localeCompare(b.time_start)),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const upcoming = sorted.filter((day) => (
    day.date >= currentDay && (day.blocks.length > 0 || isStaff)
  ));
  const past = sorted.filter((day) => day.date < currentDay && day.blocks.length > 0);

  return { upcoming, past };
}

function formatWeekday(iso) {
  return new Date(`${iso}T00:00:00`)
    .toLocaleDateString('ru-RU', { weekday: 'short' })
    .toUpperCase();
}

function Schedule({ user }) {
  const [data, setData] = useState({ pool: null, days: [] });
  const [volunteers, setVolunteers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const currentDay = todayIso();
  const isStaff = user.role === 'team_lead' || user.role === 'admin';
  const isMobile = useIsMobile();

  const loadSchedule = useCallback(async ({ showLoading = false, includeVolunteers = false } = {}) => {
    if (showLoading) {
      setLoading(true);
    }
    setError('');
    try {
      const [res, people] = await Promise.all([
        api.get('/api/schedule'),
        includeVolunteers && isStaff ? api.get('/api/volunteers') : Promise.resolve(null),
      ]);
      setData(res);
      if (people) {
        setVolunteers(people);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, [isStaff]);

  useEffect(() => {
    loadSchedule({ showLoading: true, includeVolunteers: true });
  }, [loadSchedule]);

  const isMine = (block) => block.volunteers.some((v) => v.user_id === user.id);

  const updateBlockState = useCallback((blockId, updater) => {
    setData((prev) => ({
      ...prev,
      days: prev.days.map((day) => ({
        ...day,
        blocks: day.blocks.map((block) => (
          block.id === blockId ? updater(block) : block
        )),
      })),
    }));
  }, []);

  const removeBlockState = useCallback((blockId) => {
    setData((prev) => ({
      ...prev,
      days: prev.days.map((day) => ({
        ...day,
        blocks: day.blocks.filter((block) => block.id !== blockId),
      })),
    }));
  }, []);

  const toggleSignup = async (block) => {
    try {
      if (isMine(block)) {
        await api.del(`/api/blocks/${block.id}/signup`);
        updateBlockState(block.id, (current) => {
          const volunteers = current.volunteers.filter((v) => v.user_id !== user.id);
          return { ...current, volunteers, count: volunteers.length };
        });
      } else {
        await api.post(`/api/blocks/${block.id}/signup`);
        updateBlockState(block.id, (current) => {
          if (current.volunteers.some((v) => v.user_id === user.id)) return current;
          const volunteer = {
            user_id: user.id,
            nick: user.nick,
            name: user.name || user.nick,
            telegram: user.telegram,
            role: user.role,
          };
          const volunteers = [...current.volunteers, volunteer];
          return { ...current, volunteers, count: volunteers.length };
        });
      }
    } catch (e) {
      alert(e.message);
    }
  };

  const removeVolunteer = async (block, v) => {
    if (!window.confirm(`Снять @${v.nick} со смены?`)) return;
    try {
      await api.del(`/api/blocks/${block.id}/signup?user_id=${v.user_id}`);
      updateBlockState(block.id, (current) => {
        const volunteers = current.volunteers.filter((item) => item.user_id !== v.user_id);
        return { ...current, volunteers, count: volunteers.length };
      });
    } catch (e) {
      alert(e.message);
    }
  };

  const deleteBlock = async (block) => {
    if (!window.confirm('Удалить этот тайм-блок со всеми записями?')) return;
    try {
      await api.del(`/api/blocks/${block.id}`);
      removeBlockState(block.id);
    } catch (e) {
      alert(e.message);
    }
  };

  const changeCapacity = async (blockId, delta) => {
    try {
      const response = await api.patch(`/api/blocks/${blockId}/capacity`, { delta });
      updateBlockState(blockId, (current) => ({ ...current, capacity: response.capacity }));
    } catch (e) {
      alert(e.message);
    }
  };

  const assignVolunteer = async (block, userId) => {
    if (!userId) return;
    try {
      await api.post(`/api/blocks/${block.id}/signup`, { user_id: Number(userId) });
      const person = (volunteers || []).find((item) => item.id === Number(userId));
      if (!person) return;
      updateBlockState(block.id, (current) => {
        if (current.volunteers.some((v) => v.user_id === person.id)) return current;
        const volunteer = {
          user_id: person.id,
          nick: person.nick,
          name: person.name || person.nick,
          telegram: person.telegram,
          role: person.role,
        };
        const nextVolunteers = [...current.volunteers, volunteer];
        return { ...current, volunteers: nextVolunteers, count: nextVolunteers.length };
      });
    } catch (e) {
      alert(e.message);
    }
  };

  if (loading) return <Loader text="Загрузка графика..." />;
  if (error) {
    return (
      <div className="page schedule-page">
        <div className="page-header">
          <h1>График смен</h1>
        </div>
        <div className="page-error">
          <p>{error}</p>
          <button type="button" className="btn-secondary" onClick={() => loadSchedule({ showLoading: true, includeVolunteers: true })}>
            Повторить
          </button>
        </div>
      </div>
    );
  }

  if (!data.pool) {
    return (
      <div className="page schedule-page">
        <div className="page-header">
          <h1>График смен</h1>
        </div>
        <div className="empty-state">
          {isStaff
            ? <p>Активного бассейна пока нет. Создай его в разделе «Настройка».</p>
            : <p>Тебя пока не добавили на бассейн. Обратись к тимлиду.</p>
          }
        </div>
      </div>
    );
  }

  const weeks = groupWeeks(data.days);
  const mobile = groupDaysMobile(data.days, currentDay, isStaff);

  return (
    <div className="page schedule-page">
      <div className="page-header">
        <h1>График смен</h1>
      </div>
      {data.days.length === 0 ? (
        <div className="empty-state">
          <p>Тайм-блоков пока нет.</p>
          {isStaff && <p>Добавь их в разделе «Настройка».</p>}
        </div>
      ) : (
        isMobile ? (
          <div className="schedule-day-list">
            {mobile.upcoming.map((day) => {
              const isToday = day.date === currentDay;
              const isExam = day.blocks.some((block) => block.label === 'EXAM');
              const weekdayIndex = new Date(`${day.date}T00:00:00`).getDay();
              const isMonday = weekdayIndex === 1;
              const dayAssigned = day.blocks.reduce((sum, block) => sum + (block.count || 0), 0);
              const dayCapacity = day.blocks.reduce((sum, block) => sum + (block.capacity || 0), 0);

              return (
                <section key={day.date} className={`day-section ${isMonday ? 'week-break' : ''}`}>
                  <header className={`day-section-header ${isExam ? 'exam-day' : ''} ${isToday ? 'today' : ''}`}>
                    <span className="day-section-title">
                      {isToday && <span className="day-today-label">Сегодня · </span>}
                      {formatWeekday(day.date)} {formatDay(day.date)}
                    </span>
                    {isExam && <span className="day-header-badge">Экзамен</span>}
                    {isStaff && (
                      <span className="day-fill">
                        {dayAssigned}/{dayCapacity}
                      </span>
                    )}
                  </header>

                  {day.blocks.map((block) => (
                    <BlockCard
                      key={block.id}
                      block={block}
                      user={user}
                      isStaff={isStaff}
                      isToday={isToday}
                      isMine={isMine}
                      onToggleSignup={toggleSignup}
                      onRemoveVolunteer={removeVolunteer}
                      onDeleteBlock={deleteBlock}
                      onChangeCapacity={changeCapacity}
                      volunteers={volunteers}
                      onAssignVolunteer={assignVolunteer}
                    />
                  ))}

                  {isStaff && (
                    <div className="day-section-add">
                      <AddBlock date={day.date} poolId={data.pool.id} onAdded={() => loadSchedule()} />
                    </div>
                  )}
                </section>
              );
            })}

            {mobile.past.length > 0 && (
              <details className="past-days">
                <summary>Прошедшие смены ({mobile.past.reduce((sum, day) => sum + day.blocks.length, 0)})</summary>
                <div className="past-days-list">
                  {mobile.past.map((day) => {
                    const isToday = day.date === currentDay;
                    const isExam = day.blocks.some((block) => block.label === 'EXAM');
                    const weekdayIndex = new Date(`${day.date}T00:00:00`).getDay();
                    const isMonday = weekdayIndex === 1;
                    const dayAssigned = day.blocks.reduce((sum, block) => sum + (block.count || 0), 0);
                    const dayCapacity = day.blocks.reduce((sum, block) => sum + (block.capacity || 0), 0);

                    return (
                      <section key={day.date} className={`day-section ${isMonday ? 'week-break' : ''}`}>
                        <header className={`day-section-header ${isExam ? 'exam-day' : ''} ${isToday ? 'today' : ''}`}>
                          <span className="day-section-title">
                            {formatWeekday(day.date)} {formatDay(day.date)}
                          </span>
                          {isExam && <span className="day-header-badge">Экзамен</span>}
                          {isStaff && (
                            <span className="day-fill">
                              {dayAssigned}/{dayCapacity}
                            </span>
                          )}
                        </header>

                        {day.blocks.map((block) => (
                          <BlockCard
                            key={block.id}
                            block={block}
                            user={user}
                            isStaff={isStaff}
                            isToday={isToday}
                            isMine={isMine}
                            onToggleSignup={toggleSignup}
                            onRemoveVolunteer={removeVolunteer}
                            onDeleteBlock={deleteBlock}
                            onChangeCapacity={changeCapacity}
                            volunteers={volunteers}
                            onAssignVolunteer={assignVolunteer}
                          />
                        ))}
                      </section>
                    );
                  })}
                </div>
              </details>
            )}
          </div>
        ) : (
          <div className="schedule-weeks">
            {weeks.map((week) => (
              <div key={week.start} className="week-table">
                <div className="week-header-row">
                  {week.days.map((day) => (
                    <div
                      key={day.date}
                      className={`day-header ${day.blocks.some((block) => block.label === 'EXAM') ? 'exam-day' : ''} ${day.date === currentDay ? 'today' : ''}`}
                    >
                      <span className="day-header-left">
                        <span>{day.label}</span>
                        {day.blocks.some((block) => block.label === 'EXAM') ? (
                          <span className="day-header-badge">Экзамен</span>
                        ) : null}
                      </span>
                      <span>{formatDay(day.date)}</span>
                    </div>
                  ))}
                </div>

                {Array.from({ length: week.maxRows }).map((_, rowIndex) => (
                  <div key={rowIndex} className="week-block-row">
                    {week.days.map((day) => {
                      const block = day.blocks[rowIndex];
                      return (
                        <div key={`${day.date}-${rowIndex}`} className={`week-cell ${day.date === currentDay ? 'today' : ''}`}>
                          {block ? (
                            <BlockCard
                              block={block}
                              user={user}
                              isStaff={isStaff}
                              isToday={day.date === currentDay}
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
                        <AddBlock date={day.date} poolId={data.pool.id} onAdded={() => loadSchedule()} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

function BlockCard({
  block,
  user,
  isStaff,
  isToday,
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
    <div className={`block-card ${block.label === 'EXAM' ? 'exam' : ''} ${isToday ? 'today' : ''}`}>
      <div className="block-time">
        <span>{block.time_start}–{block.time_end}</span>
        {block.label && block.label !== 'EXAM' ? <span className="block-label">{block.label}</span> : null}
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
            <option value="">Волонтер</option>
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
        className={`btn-secondary block-signup ${mine ? 'leave' : ''}`}
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
