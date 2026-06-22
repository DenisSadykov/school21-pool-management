import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2 } from 'lucide-react';
import '../styles/Pages.css';

function Shifts() {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    fetchShifts();
  }, []);

  const fetchShifts = async () => {
    try {
      const response = await fetch('/api/shifts');
      const data = await response.json();
      setShifts(data);
    } catch (error) {
      console.error('Ошибка загрузки смен:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Удалить эту смену?')) return;
    try {
      await fetch(`/api/shifts/${id}`, { method: 'DELETE' });
      setShifts(shifts.filter(s => s.id !== id));
    } catch (error) {
      console.error('Ошибка удаления:', error);
    }
  };

  if (loading) return <div className="loading">Загрузка смен...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1>📅 Смены</h1>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          <Plus size={20} /> Добавить смену
        </button>
      </div>

      {showForm && <ShiftForm onClose={() => setShowForm(false)} onSuccess={fetchShifts} />}

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Время</th>
              <th>Место</th>
              <th>Волонтёры</th>
              <th>Статус</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {shifts.length === 0 ? (
              <tr><td colSpan="6" className="text-center">Нет смен</td></tr>
            ) : (
              shifts.map((shift) => (
                <tr key={shift.id}>
                  <td>{new Date(shift.date).toLocaleDateString('ru-RU')}</td>
                  <td>{shift.time_start}–{shift.time_end}</td>
                  <td>{shift.location}</td>
                  <td>{shift.volunteers?.join(', ') || '—'}</td>
                  <td>
                    <span className={`badge badge-${shift.status}`}>
                      {shift.status === 'confirmed' ? '✅ Подтверждено' : '⏳ Ожидание'}
                    </span>
                  </td>
                  <td className="actions">
                    <button className="btn-icon" title="Редактировать">
                      <Edit size={16} />
                    </button>
                    <button
                      className="btn-icon danger"
                      onClick={() => handleDelete(shift.id)}
                      title="Удалить"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ShiftForm({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    date: '',
    time_start: '10:00',
    time_end: '14:00',
    location: 'Бассейн',
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (response.ok) {
        onSuccess();
        onClose();
      }
    } catch (error) {
      console.error('Ошибка создания смены:', error);
    }
  };

  return (
    <form className="form" onSubmit={handleSubmit}>
      <div className="form-row">
        <div className="form-group">
          <label>Дата</label>
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            required
          />
        </div>
        <div className="form-group">
          <label>Начало</label>
          <input
            type="time"
            value={form.time_start}
            onChange={(e) => setForm({ ...form, time_start: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label>Конец</label>
          <input
            type="time"
            value={form.time_end}
            onChange={(e) => setForm({ ...form, time_end: e.target.value })}
          />
        </div>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn-primary">Создать</button>
        <button type="button" className="btn-secondary" onClick={onClose}>Отмена</button>
      </div>
    </form>
  );
}

export default Shifts;
