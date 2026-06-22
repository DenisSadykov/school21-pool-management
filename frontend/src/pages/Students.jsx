import React, { useState, useEffect } from 'react';
import { Plus, Trash2, AlertCircle } from 'lucide-react';
import '../styles/Students.css';

function Students() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001';
      const response = await fetch(`${apiUrl}/api/students`);
      const data = await response.json();
      // Сортировать по количеству штрафов (спереди те с больше штрафами)
      data.sort((a, b) => b.total_penalty_hours - a.total_penalty_hours);
      setStudents(data);
    } catch (error) {
      console.error('Ошибка загрузки учеников:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="loading">Загрузка учеников...</div>;

  return (
    <div className="page students-page">
      <div className="page-header">
        <div>
          <h1>👥 Ученики бассейна</h1>
          <p className="subtitle">Список всех учеников с их штрафами</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          <Plus size={20} /> Добавить ученика
        </button>
      </div>

      {showForm && (
        <StudentForm
          onClose={() => setShowForm(false)}
          onSuccess={() => {
            setShowForm(false);
            fetchStudents();
          }}
        />
      )}

      <div className="students-stats">
        <div className="stat">
          <span>Всего учеников:</span>
          <strong>{students.length}</strong>
        </div>
        <div className="stat">
          <span>Со штрафами:</span>
          <strong className="alert">{students.filter(s => s.total_penalty_hours > 0).length}</strong>
        </div>
        <div className="stat">
          <span>Всего штрафных часов:</span>
          <strong>{students.reduce((sum, s) => sum + s.total_penalty_hours, 0)}</strong>
        </div>
      </div>

      <div className="students-grid">
        {students.length === 0 ? (
          <div className="empty-state">
            <p>Нет учеников. Добавьте первого ученика!</p>
          </div>
        ) : (
          students.map(student => (
            <StudentCard
              key={student.id}
              student={student}
              onDelete={() => fetchStudents()}
            />
          ))
        )}
      </div>
    </div>
  );
}

function StudentCard({ student, onDelete }) {
  const handleDelete = async () => {
    if (!window.confirm(`Удалить ученика ${student.name}?`)) return;

    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001';
      await fetch(`${apiUrl}/api/students/${student.id}`, { method: 'DELETE' });
      onDelete();
    } catch (error) {
      alert('Ошибка: ' + error.message);
    }
  };

  const hasPenalties = student.total_penalty_hours > 0;
  const statusColor = student.total_penalty_hours > 10 ? 'danger' : student.total_penalty_hours > 0 ? 'warning' : 'safe';

  return (
    <div className={`student-card status-${statusColor}`}>
      <div className="student-header">
        <div>
          <h3>{student.name}</h3>
          <p className="nick">@{student.nick}</p>
        </div>
        <button className="btn-delete" onClick={handleDelete} title="Удалить">
          <Trash2 size={18} />
        </button>
      </div>

      <div className="student-body">
        {student.tribe && (
          <div className="tribe-badge">Группа {student.tribe}</div>
        )}

        {hasPenalties ? (
          <div className="penalties-summary">
            <div className="penalty-stat">
              <span>Штрафных часов:</span>
              <strong className="hours">{student.total_penalty_hours}h</strong>
            </div>
            <div className="penalty-stat">
              <span>Ожидает отработки:</span>
              <strong className="pending">{student.pending_penalties}</strong>
            </div>
          </div>
        ) : (
          <div className="no-penalties">
            ✅ Штрафов нет
          </div>
        )}
      </div>

      {hasPenalties && student.penalties.length > 0 && (
        <div className="penalties-list">
          <p className="list-title">Последние штрафы:</p>
          {student.penalties.slice(0, 3).map((penalty, idx) => (
            <div key={idx} className="penalty-item">
              <span className={`status ${penalty.status}`}>{penalty.status}</span>
              <span className="hours">{penalty.hours}h</span>
              <span className="volunteer">{penalty.volunteer}</span>
            </div>
          ))}
          {student.penalties.length > 3 && (
            <p className="more">+ ещё {student.penalties.length - 3}</p>
          )}
        </div>
      )}
    </div>
  );
}

function StudentForm({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    nick: '',
    name: '',
    tribe: 'A'
  });

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.nick.trim() || !form.name.trim()) {
      alert('Заполните все поля');
      return;
    }

    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001';
      const response = await fetch(`${apiUrl}/api/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });

      if (response.ok) {
        alert(`✅ Ученик ${form.name} добавлен!`);
        onSuccess();
      }
    } catch (error) {
      alert('❌ Ошибка: ' + error.message);
    }
  };

  return (
    <form className="student-form" onSubmit={handleSubmit}>
      <h2>➕ Добавить нового ученика</h2>

      <div className="form-row">
        <div className="form-group">
          <label>Ник (уникальный)</label>
          <input
            type="text"
            placeholder="example_nick"
            value={form.nick}
            onChange={(e) => setForm({ ...form, nick: e.target.value })}
            autoFocus
          />
        </div>

        <div className="form-group">
          <label>Полное имя</label>
          <input
            type="text"
            placeholder="Иван Петров"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label>Группа (триб)</label>
          <select
            value={form.tribe}
            onChange={(e) => setForm({ ...form, tribe: e.target.value })}
          >
            <option value="A">Группа A</option>
            <option value="B">Группа B</option>
            <option value="C">Группа C</option>
          </select>
        </div>
      </div>

      <div className="form-actions">
        <button type="submit" className="btn-primary">
          Добавить
        </button>
        <button type="button" className="btn-secondary" onClick={onClose}>
          Отмена
        </button>
      </div>
    </form>
  );
}

export default Students;
