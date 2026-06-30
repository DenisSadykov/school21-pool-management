import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../api';
import '../styles/GroupReviews.css';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function GroupReviews({ user }) {
  const [reviews, setReviews] = useState([]);
  const [volunteers, setVolunteers] = useState([]);
  const [loading, setLoading] = useState(true);
  const isStaff = user?.role === 'team_lead' || user?.role === 'admin';

  const load = async () => {
    setLoading(true);
    try {
      const [reviewRows, people] = await Promise.all([
        api.get('/api/group-reviews'),
        isStaff ? api.get('/api/volunteers') : Promise.resolve([]),
      ]);
      setReviews(reviewRows);
      setVolunteers(people);
    } catch (error) {
      alert('Ошибка: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const remove = async (review) => {
    if (!window.confirm(`Удалить проверок: ${review.quantity || 1} у @${review.reviewer?.nick}?`)) return;
    try {
      await api.del(`/api/group-reviews/${review.id}`);
      load();
    } catch (error) {
      alert('Ошибка: ' + error.message);
    }
  };

  if (loading) return <div className="loading">Загрузка групповых проверок...</div>;

  return (
    <div className="page group-reviews-page">
      <div className="page-header">
        <div>
          <h1>Групповые проверки</h1>
        </div>
      </div>

      {isStaff && <GroupReviewForm volunteers={volunteers} onSuccess={load} />}

      <div className="group-review-summary">
        <Summary label="Всего проверок" value={reviews.reduce((sum, review) => sum + (review.quantity || 1), 0)} />
        <Summary label="Проверяющих" value={new Set(reviews.map((review) => review.reviewer?.id).filter(Boolean)).size} />
        <Summary label="Коинов начислено" value={reviews.reduce((sum, review) => sum + (review.quantity || 1), 0) * 25} />
      </div>

      <div className="group-review-table-wrap">
        {reviews.length === 0 ? (
          <div className="empty-state">Проверок пока нет.</div>
        ) : (
          <table className="group-review-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Время</th>
                <th>Проверяющий</th>
                <th>Проверок</th>
                <th>Коины</th>
                {isStaff && <th>Управление</th>}
              </tr>
            </thead>
            <tbody>
              {reviews.map((review) => (
                <tr key={review.id}>
                  <td>{new Date(`${review.date}T00:00:00`).toLocaleDateString('ru-RU')}</td>
                  <td>{review.time_start}</td>
                  <td>
                    <div className="reviewer-cell">
                      <strong>@{review.reviewer?.nick || '—'}</strong>
                      <span>{review.reviewer?.name || ''}</span>
                    </div>
                  </td>
                  <td>{review.quantity || 1}</td>
                  <td><strong className="coin-value">{(review.quantity || 1) * 25}</strong></td>
                  {isStaff && (
                    <td className="group-review-actions-cell">
                      <div className="group-review-actions">
                        <button className="btn-icon danger" type="button" onClick={() => remove(review)} title="Удалить">
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Summary({ label, value }) {
  return (
    <div className="summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function GroupReviewForm({ volunteers, onSuccess }) {
  const [form, setForm] = useState({
    date: todayIso(),
    time_start: '10:00',
    quantity: 1,
    reviewer_id: '',
  });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.reviewer_id) {
      alert('Выберите проверяющего');
      return;
    }
    try {
      await api.post('/api/group-reviews', form);
      setForm({ ...form, quantity: 1, reviewer_id: '' });
      onSuccess();
    } catch (error) {
      alert('Ошибка: ' + error.message);
    }
  };

  return (
    <form className="group-review-form" onSubmit={submit}>
      <label>
        Дата
        <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
      </label>
      <label>
        Время
        <input type="time" value={form.time_start} onChange={(e) => setForm({ ...form, time_start: e.target.value })} />
      </label>
      <label>
        Проверяющий
        <select value={form.reviewer_id} onChange={(e) => setForm({ ...form, reviewer_id: e.target.value })}>
          <option value="">Выбрать</option>
          {volunteers.map((person) => (
            <option value={person.id} key={person.id}>@{person.nick} · {person.name}</option>
          ))}
        </select>
      </label>
      <label>
        Количество проверок
        <input type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
      </label>
      <button type="submit" className="btn-primary">
        <Plus size={18} /> Добавить
      </button>
    </form>
  );
}

export default GroupReviews;
