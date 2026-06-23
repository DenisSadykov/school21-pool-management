import React, { useEffect, useState } from 'react';
import { CalendarPlus, Link as LinkIcon, Plus, Trash2, Trophy } from 'lucide-react';
import { api } from '../api';
import '../styles/MyTribe.css';

const TRIBES = ['Ленты', 'Короны', 'Олени'];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function MyTribe({ user }) {
  const [data, setData] = useState(null);
  const [selectedTribe, setSelectedTribe] = useState(user?.tribe || '');
  const [loading, setLoading] = useState(true);

  const load = async (tribe = selectedTribe) => {
    setLoading(true);
    try {
      const query = tribe ? `?tribe=${encodeURIComponent(tribe)}` : '';
      const payload = await api.get(`/api/my-tribe${query}`);
      setData(payload);
      setSelectedTribe(payload.tribe);
    } catch (error) {
      alert('Ошибка: ' + error.message);
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

  useEffect(() => {
    load(selectedTribe);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading && !data) return <div className="loading">Загрузка трайба...</div>;
  const canSwitchTribe = user?.role === 'admin';

  return (
    <div className="page my-tribe-page">
      <div className="page-header">
        <div>
          <h1>Мой трайб</h1>
          <p className="subtitle">Мероприятия учеников и встречи трайба</p>
        </div>
        {canSwitchTribe ? (
          <label className="tribe-switcher">
            Трайб
            <select value={selectedTribe} onChange={(e) => load(e.target.value)}>
              {(data?.available_tribes || TRIBES).map((tribe) => (
                <option value={tribe} key={tribe}>{tribe}</option>
              ))}
            </select>
          </label>
        ) : (
          <div className="tribe-current">
            <span>Трайб</span>
            <strong>{selectedTribe || 'не назначен'}</strong>
          </div>
        )}
      </div>

      <div className="tribe-summary">
        <SummaryCard label="Место" value={data?.rank ? `${data.rank}/3` : '—'} icon={Trophy} />
        <SummaryCard label="Баллы" value={data?.points_total || 0} />
        <SummaryCard label="Подтверждено" value={data?.events_total || 0} />
        <SummaryCard label="Развлекательные" value={data?.entertainment_events || 0} />
        <SummaryCard label="Обучающие" value={data?.education_events || 0} />
      </div>

      <div className="tribe-layout">
        <StudentEventForm students={data?.students || []} onSuccess={() => load(selectedTribe)} />
        <TribeEventForm tribe={selectedTribe} onSuccess={() => load(selectedTribe)} />
      </div>

      <section className="tribe-panel">
        <h2>Мероприятия учеников</h2>
        {(data?.student_events || []).length === 0 ? (
          <p className="text-muted">Пока нет добавленных мероприятий.</p>
        ) : (
          <div className="student-event-list">
            {data.student_events.map((event) => (
              <div className="student-event-row" key={event.id}>
                <div>
                  <strong>@{event.student_nick}</strong>
                  <span>{event.type === 'education' ? 'Обучающее' : 'Развлекательное'} · {event.date || 'без даты'} · {event.points || 0} балл.</span>
                </div>
                <div className="student-event-links">
                  <span className={`event-status ${event.status || 'pending'}`}>
                    {event.status === 'confirmed' ? 'подтверждено' : event.status === 'rejected' ? 'отклонено' : 'на проверке'}
                  </span>
                  {event.post_url && <a href={event.post_url} target="_blank" rel="noreferrer">пост</a>}
                </div>
                {user?.role === 'admin' && (
                  <div className="student-event-admin">
                    <button type="button" onClick={() => updateStudentEventStatus(event, 'confirmed')}>OK</button>
                    <button type="button" onClick={() => updateStudentEventStatus(event, 'rejected')}>Нет</button>
                  </div>
                )}
                <button className="btn-icon danger" type="button" onClick={() => deleteStudentEvent(event)} title="Удалить">
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="tribe-layout">
        <section className="tribe-panel">
          <h2>Топ учеников трайба</h2>
          {(data?.top_students || []).length === 0 ? (
            <p className="text-muted">Пока нет мероприятий учеников.</p>
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
          <h2>Календарь трайба</h2>
          {(data?.tribe_events || []).length === 0 ? (
            <p className="text-muted">Встреч трайба пока нет.</p>
          ) : (
            <div className="tribe-list">
              {data.tribe_events.map((event) => (
                <div className="tribe-row stacked" key={event.id}>
                  <span>{event.date}{event.time_start ? ` · ${event.time_start}` : ''}</span>
                  <strong>{event.title}</strong>
                  {event.location && <small>{event.location}</small>}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon }) {
  return (
    <div className="summary-card">
      {Icon && <Icon size={22} />}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StudentEventForm({ students, onSuccess }) {
  const [form, setForm] = useState({
    student_id: '',
    event_type: 'entertainment',
    event_date: todayIso(),
    post_url: '',
    comment: '',
  });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.student_id) {
      alert('Выберите ученика');
      return;
    }
    await api.post(`/api/students/${form.student_id}/events`, form);
    setForm({ ...form, post_url: '', comment: '' });
    onSuccess();
  };

  return (
    <form className="tribe-panel" onSubmit={submit}>
      <h2><Plus size={18} /> Мероприятие ученика</h2>
      <div className="form-grid">
        <label>
          Ученик
          <select value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })}>
            <option value="">Выбрать</option>
            {students.map((student) => (
              <option value={student.id} key={student.id}>@{student.nick} · {student.name}</option>
            ))}
          </select>
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
        </label>
        <label>
          Ссылка на пост
          <input value={form.post_url} onChange={(e) => setForm({ ...form, post_url: e.target.value })} placeholder="https://..." />
        </label>
        <label className="full">
          Комментарий
          <textarea value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
        </label>
      </div>
      <button className="btn-primary" type="submit"><LinkIcon size={18} /> Добавить</button>
    </form>
  );
}

function TribeEventForm({ tribe, onSuccess }) {
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
    <form className="tribe-panel" onSubmit={submit}>
      <h2><CalendarPlus size={18} /> Встреча трайба</h2>
      <div className="form-grid">
        <label className="full">
          Название
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Разбор, встреча, созвон..." />
        </label>
        <label>
          Дата
          <input type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} />
        </label>
        <label>
          Время
          <input type="time" value={form.time_start} onChange={(e) => setForm({ ...form, time_start: e.target.value })} />
        </label>
        <label className="full">
          Место
          <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Кампус, онлайн, аудитория..." />
        </label>
        <label className="full">
          Комментарий
          <textarea value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
        </label>
      </div>
      <button className="btn-primary" type="submit"><CalendarPlus size={18} /> В календарь</button>
    </form>
  );
}

export default MyTribe;
