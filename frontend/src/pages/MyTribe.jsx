import React, { useEffect, useRef, useState } from 'react';
import { CalendarPlus, ChevronDown, Link as LinkIcon, Plus, Trash2, Trophy } from 'lucide-react';
import { api } from '../api';
import Loader from '../components/Loader';
import TribeLabel from '../components/TribeLabel';
import '../styles/Pages.css';
import '../styles/MyTribe.css';
import { moscowTodayIso } from '../utils/date';

function todayIso() {
  return moscowTodayIso();
}

function MyTribe({ user }) {
  const [data, setData] = useState(null);
  const [selectedTribe, setSelectedTribe] = useState(user?.tribe || '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (tribe = selectedTribe) => {
    setLoading(true);
    setError('');
    try {
      const query = tribe ? `?tribe=${encodeURIComponent(tribe)}` : '';
      const payload = await api.get(`/api/my-tribe${query}`);
      setData(payload);
      setSelectedTribe(payload.tribe);
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteStudentEvent = async (event) => {
    if (!window.confirm(`Удалить мероприятие @${event.student_nick}?`)) return;
    try {
      await api.del(`/api/student-events/${event.id}`);
      load(selectedTribe);
    } catch (error) {
      alert('Ошибка: ' + error.message);
    }
  };

  const updateStudentEventStatus = async (event, status) => {
    try {
      await api.patch(`/api/student-events/${event.id}`, { status });
      load(selectedTribe);
    } catch (error) {
      alert('Ошибка: ' + error.message);
    }
  };

  const generateStandardTribeEvents = async () => {
    if (!selectedTribe) {
      alert('Сначала выбери трайб');
      return;
    }
    if (!window.confirm(`Выставить стандартное расписание встреч только для трайба "${selectedTribe}"?`)) return;
    try {
      const res = await api.post('/api/tribe-events/generate-standard', { tribe: selectedTribe });
      alert(res.message || 'Стандартные встречи созданы');
      load(selectedTribe);
    } catch (error) {
      alert('Ошибка: ' + error.message);
    }
  };

  const deleteTribeEvent = async (event) => {
    if (!window.confirm(`Удалить встречу "${event.title}" у трайба "${event.tribe}"?`)) return;
    try {
      await api.del(`/api/tribe-events/${event.id}`);
      load(selectedTribe);
    } catch (error) {
      alert('Ошибка: ' + error.message);
    }
  };

  useEffect(() => {
    load(selectedTribe);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading && !data) return <Loader text="Загрузка трайба..." />;
  const isStaff = user?.role === 'admin' || user?.role === 'team_lead';
  const isTribeMaster = user?.role === 'tribe_master';
  const canSwitchTribe = isStaff;
  const pageTitle = isStaff ? 'Трайбы' : '';
  const selectedTribeIcon = selectedTribe
    ? <TribeLabel tribe={selectedTribe} size={18} showText={false} className="tribe-title-icon" />
    : null;

  return (
    <div className="page my-tribe-page">
      <div className={`page-header ${!canSwitchTribe ? 'page-header-right' : ''}`}>
        {pageTitle ? (
          <div>
            <h1>{pageTitle}</h1>
          </div>
        ) : <div />}
        {!canSwitchTribe && !isTribeMaster ? (
          <div className="tribe-current">
            <span>Трайб</span>
            <strong className="tribe-current-name">
              {selectedTribe ? (
                <>
                  <span>{selectedTribe}</span>
                  <TribeLabel tribe={selectedTribe} size={22} showText={false} />
                </>
              ) : 'не назначен'}
            </strong>
          </div>
        ) : null}
      </div>

      {error && (
        <div className="page-error">
          <p>{error}</p>
          <button type="button" className="btn-secondary" onClick={() => load(selectedTribe)}>
            Повторить
          </button>
        </div>
      )}

      {!error && (
        <>
      <section className="tribe-panel">
        <h2><Trophy size={18} /> Рейтинг трайбов</h2>
        {(data?.rankings || []).length === 0 ? (
          <p className="text-muted">Пока нет данных по трайбам.</p>
        ) : (
          <div className="ranking-list">
            {data.rankings.map((row) => (
              <div
                className={`ranking-row ${row.tribe === selectedTribe ? 'current' : ''} ${canSwitchTribe ? 'clickable' : ''}`}
                key={row.tribe}
                onClick={canSwitchTribe ? () => load(row.tribe) : undefined}
                onKeyDown={canSwitchTribe ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    load(row.tribe);
                  }
                } : undefined}
                role={canSwitchTribe ? 'button' : undefined}
                tabIndex={canSwitchTribe ? 0 : undefined}
                title={canSwitchTribe ? `Открыть трайб ${row.tribe}` : undefined}
              >
                <strong className="ranking-row-title">
                  <span>{row.rank}. <TribeLabel tribe={row.tribe} size={18} /></span>
                  {!canSwitchTribe && row.tribe === selectedTribe ? (
                    <span className="ranking-current-badge">Твой трайб</span>
                  ) : null}
                </strong>
                <span>Всего: {row.events_total}</span>
                <span>развл.: {row.entertainment_events}</span>
                <span>обуч.: {row.education_events}</span>
                <span>подтверждено: {row.events_total} из {row.events_created_total || 0}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <TribeEventForm
        tribe={selectedTribe}
        tribeIcon={selectedTribeIcon}
        onSuccess={() => load(selectedTribe)}
        onGenerateStandard={generateStandardTribeEvents}
      />

      {isStaff && (
        <AllTribeMeetings events={data?.all_tribe_events || []} onDelete={deleteTribeEvent} tribeIcon={selectedTribeIcon} />
      )}

      <StudentEventForm students={data?.students || []} onSuccess={() => load(selectedTribe)} />

      <section className="tribe-panel">
        <h2>Топ учеников трайба {selectedTribeIcon}</h2>
        {(data?.top_students || []).length === 0 ? (
          <p className="text-muted">Пока нет подтвержденных мероприятий учеников.</p>
        ) : (
          <div className="tribe-list">
            {data.top_students.map((student, index) => (
              <div className="tribe-row" key={student.id}>
                <span>{index + 1}. @{student.nick}</span>
                <strong>{student.points || 0}</strong>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="tribe-panel">
        <h2>Все заведённые мероприятия {selectedTribeIcon}</h2>
        {(data?.student_events || []).length === 0 ? (
          <p className="text-muted">Пока нет добавленных мероприятий.</p>
        ) : (
          <div className="student-event-table">
            <div className="student-event-head">
              <span>Ник</span>
              <span>Мероприятие</span>
              <span>Статус</span>
              <span>Еще</span>
            </div>
            <div className="student-event-list">
            {data.student_events.map((event) => (
              <div className="student-event-row" key={event.id}>
                <div>
                  <strong>@{event.student_nick}</strong>
                </div>
                <div className="student-event-meta">
                  <span>{event.type === 'education' ? 'Обучающее' : 'Развлекательное'} · {event.date || 'без даты'} · {event.points || 0} балл.</span>
                </div>
                <div className="student-event-links">
                  <span className={`event-status ${event.status || 'pending'}`}>
                    {event.status === 'confirmed' ? 'подтверждено' : event.status === 'rejected' ? 'отклонено' : 'ждет подтверждения АДМ'}
                  </span>
                </div>
                <div className="student-event-admin">
                  {event.post_url && <a href={event.post_url} target="_blank" rel="noreferrer">Пост</a>}
                  {isStaff && <button type="button" onClick={() => updateStudentEventStatus(event, 'confirmed')}>Подтвердить</button>}
                  {isStaff && <button type="button" onClick={() => updateStudentEventStatus(event, 'pending')}>Ждет АДМ</button>}
                  {isStaff && <button type="button" onClick={() => updateStudentEventStatus(event, 'rejected')}>Отклонить</button>}
                  <button className="btn-icon danger" type="button" onClick={() => deleteStudentEvent(event)} title="Удалить">
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
            </div>
          </div>
        )}
      </section>
        </>
      )}
    </div>
  );
}

function formatMeetingDate(value) {
  if (!value) return 'без даты';
  return new Date(`${value}T00:00:00`).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
  });
}

function formatMeetingWeekday(value) {
  if (!value) return '';
  return new Date(`${value}T00:00:00`).toLocaleDateString('ru-RU', {
    weekday: 'short',
  });
}

function formatLongDate(value) {
  if (!value) return '';
  return new Date(`${value}T00:00:00`).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function buildMeetingDays(events) {
  if (!events.length) return [];
  const sorted = [...events].sort((a, b) => `${a.date} ${a.time_start || ''}`.localeCompare(`${b.date} ${b.time_start || ''}`));
  return [...new Set(sorted.map((event) => event.date))];
}

function AllTribeMeetings({ events, onDelete, tribeIcon }) {
  const sortedEvents = [...events].sort((a, b) => `${a.date} ${a.time_start || ''}`.localeCompare(`${b.date} ${b.time_start || ''}`));
  const days = buildMeetingDays(sortedEvents);

  return (
    <section className="tribe-panel tribe-meetings-schedule">
      <h2>Расписание встреч трайбов {tribeIcon}</h2>
      {events.length === 0 ? (
        <p className="text-muted">Пока нет назначенных встреч трайбов.</p>
      ) : (
        <div className="meeting-day-grid">
          {days.map((day) => {
            const dayEvents = sortedEvents.filter((event) => event.date === day);
            return (
              <div className={`meeting-day-card ${dayEvents.length ? 'has-events' : ''}`} key={day}>
                <div className="meeting-day-head">
                  <span>{formatMeetingWeekday(day)}</span>
                  <strong>{formatMeetingDate(day)}</strong>
                </div>
                <div className="meeting-slots">
                  {dayEvents.length === 0 ? (
                    <span className="meeting-empty">—</span>
                  ) : (
                    dayEvents.map((event) => (
                      <div className="meeting-slot" key={event.id}>
                        <div className="meeting-slot-top">
                          <strong>{event.time_start || 'без времени'}</strong>
                          <div className="meeting-slot-actions">
                            <span className="meeting-tribe"><TribeLabel tribe={event.tribe} size={14} /></span>
                            <button
                              type="button"
                              className="meeting-delete"
                              onClick={() => onDelete(event)}
                              title="Удалить встречу"
                              aria-label={`Удалить встречу ${event.title}`}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                        <p>{event.title}</p>
                        {event.location && <small>{event.location}</small>}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function StudentEventForm({ students, onSuccess }) {
  const formatStudentOption = (student) => `@${student.nick} · ${student.name}`;
  const [form, setForm] = useState({
    student_id: '',
    event_type: 'entertainment',
    event_date: todayIso(),
    post_url: '',
    comment: '',
  });
  const [studentInput, setStudentInput] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const findStudentByInput = (value) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    return students.find((student) => {
      const optionLabel = formatStudentOption(student).toLowerCase();
      return (
        optionLabel === normalized ||
        student.nick.toLowerCase() === normalized.replace(/^@/, '') ||
        (student.name || '').toLowerCase() === normalized
      );
    }) || null;
  };

  const filteredStudents = students.filter((student) => {
    const needle = studentInput.trim().toLowerCase();
    if (!needle) return true;
    return `${student.nick} ${student.name}`.toLowerCase().includes(needle);
  }).slice(0, 8);

  useEffect(() => {
    if (!dropdownOpen) return undefined;
    const handleClickOutside = (event) => {
      if (!dropdownRef.current?.contains(event.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  const submit = async (e) => {
    e.preventDefault();
    const matchedStudent = form.student_id
      ? students.find((student) => String(student.id) === String(form.student_id))
      : findStudentByInput(studentInput);

    if (!matchedStudent) {
      alert('Выберите ученика');
      return;
    }
    await api.post(`/api/students/${matchedStudent.id}/events`, {
      ...form,
      student_id: matchedStudent.id,
    });
    setForm({ ...form, student_id: matchedStudent.id, post_url: '', comment: '' });
    setStudentInput(formatStudentOption(matchedStudent));
    onSuccess();
  };

  return (
    <form className="tribe-panel student-event-form compact-form" onSubmit={submit}>
      <h2><Plus size={18} /> Мероприятие ученика</h2>
      <div className="student-event-compact-grid">
        <label>
          Ученик
          <div className="student-search" ref={dropdownRef}>
            <input
              value={studentInput}
              onFocus={() => setDropdownOpen(true)}
              onChange={(e) => {
                const nextValue = e.target.value;
                const matchedStudent = findStudentByInput(nextValue);
                setStudentInput(nextValue);
                setDropdownOpen(true);
                setForm({
                  ...form,
                  student_id: matchedStudent ? matchedStudent.id : '',
                });
              }}
              placeholder="Ник или имя"
            />
            <button
              type="button"
              className="student-search-toggle"
              aria-label="Показать список учеников"
              onClick={() => setDropdownOpen((prev) => !prev)}
            >
              <ChevronDown size={16} />
            </button>
            {dropdownOpen && (
              <div className="student-search-dropdown">
                {filteredStudents.length > 0 ? (
                  filteredStudents.map((student) => (
                    <button
                      type="button"
                      key={student.id}
                      className="student-search-option"
                      onClick={() => {
                        setStudentInput(formatStudentOption(student));
                        setForm({ ...form, student_id: student.id });
                        setDropdownOpen(false);
                      }}
                    >
                      {formatStudentOption(student)}
                    </button>
                  ))
                ) : (
                  <span className="student-search-empty">Ничего не найдено</span>
                )}
              </div>
            )}
          </div>
        </label>
        <label>
          Тип
          <select value={form.event_type} onChange={(e) => setForm({ ...form, event_type: e.target.value })}>
            <option value="entertainment">Развлекательное</option>
            <option value="education">Обучающее</option>
          </select>
        </label>
        <label>
          Дата
          <input type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} />
          {form.event_date && <span className="date-hint">{formatLongDate(form.event_date)}</span>}
        </label>
        <label>
          Ссылка на пост
          <input value={form.post_url} onChange={(e) => setForm({ ...form, post_url: e.target.value })} placeholder="https://..." />
        </label>
        <label>
          Комментарий
          <input value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} placeholder="Коротко" />
        </label>
        <button className="btn-primary compact-submit" type="submit"><LinkIcon size={16} /> Добавить</button>
      </div>
    </form>
  );
}

function TribeEventForm({ tribe, tribeIcon, onSuccess, onGenerateStandard }) {
  const [form, setForm] = useState({
    title: '',
    event_date: todayIso(),
    time_start: '',
    location: '',
    comment: '',
  });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      alert('Введите название встречи');
      return;
    }
    await api.post('/api/tribe-events', { ...form, tribe });
    setForm({ title: '', event_date: todayIso(), time_start: '', location: '', comment: '' });
    onSuccess();
  };

  return (
    <form className="tribe-panel tribe-panel-slim" onSubmit={submit}>
      <div className="panel-heading-row">
        <h2><CalendarPlus size={18} /> Встреча трайба {tribeIcon}</h2>
      </div>
      <div className="form-grid tribe-meeting-grid">
        <label>
          Название
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Разбор, встреча, созвон..." />
        </label>
        <label>
          Дата
          <input type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} />
          {form.event_date && <span className="date-hint">{formatLongDate(form.event_date)}</span>}
        </label>
        <label>
          Время
          <input type="time" value={form.time_start} onChange={(e) => setForm({ ...form, time_start: e.target.value })} />
        </label>
        <label>
          Место
          <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Кампус, онлайн, аудитория..." />
        </label>
        <label className="full">
          Комментарий
          <textarea value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
        </label>
      </div>
      <div className="tribe-meeting-actions">
        <button className="btn-secondary" type="button" onClick={onGenerateStandard}>
          Стандартное расписание встреч
        </button>
        <button className="btn-primary" type="submit"><CalendarPlus size={18} /> Добавить встречу</button>
      </div>
    </form>
  );
}

export default MyTribe;
