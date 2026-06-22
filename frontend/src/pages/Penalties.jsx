import React, { useState, useEffect } from 'react';
import { AlertCircle, Plus, Check, X } from 'lucide-react';
import '../styles/Penalties.css';

function Penalties() {
  const [penalties, setPenalties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [students, setStudents] = useState([]);
  const [searchStudent, setSearchStudent] = useState('');

  useEffect(() => {
    fetchPenalties();
    // Список студентов (в реальности из API)
    setStudents([
      'Иван Петров', 'Мария Сидорова', 'Павел Иванов',
      'Анна Смирнова', 'Олег Федоров', 'Елена Волкова'
    ]);
  }, []);

  const fetchPenalties = async () => {
    try {
      const response = await fetch('/api/penalties');
      const data = await response.json();
      setPenalties(data);
    } catch (error) {
      console.error('Ошибка загрузки штрафов:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="loading">Загрузка штрафов...</div>;

  return (
    <div className="page penalties-page">
      <div className="page-header">
        <div>
          <h1>⚠️ Штрафы учеников</h1>
          <p className="subtitle">Система штрафов за нарушения (2h → 4h → 8h)</p>
        </div>
        <button
          className="btn-penalty-primary"
          onClick={() => setShowForm(!showForm)}
        >
          <Plus size={24} /> Добавить штраф
        </button>
      </div>

      {showForm && (
        <PenaltyForm
          students={students}
          onClose={() => setShowForm(false)}
          onSuccess={() => {
            setShowForm(false);
            fetchPenalties();
          }}
        />
      )}

      <div className="penalties-info">
        <div className="info-card">
          <AlertCircle size={20} />
          <div>
            <strong>Система штрафов:</strong> Каждое нарушение = 2 часа отработки.
            Если студент не пришёл на отработку → штраф ×2 (4h → 8h → 16h)
          </div>
        </div>
      </div>

      <div className="penalties-grid">
        <div className="penalties-section">
          <h2>📋 Ожидание отработки</h2>
          <div className="penalties-list">
            {penalties.filter(p => p.workoff_status === 'pending').length === 0 ? (
              <p className="empty">Нет активных штрафов</p>
            ) : (
              penalties
                .filter(p => p.workoff_status === 'pending')
                .map(penalty => (
                  <PenaltyCard
                    key={penalty.id}
                    penalty={penalty}
                    onStatusChange={() => fetchPenalties()}
                  />
                ))
            )}
          </div>
        </div>

        <div className="penalties-section">
          <h2>✅ Отработано</h2>
          <div className="penalties-list">
            {penalties.filter(p => p.workoff_status === 'done').length === 0 ? (
              <p className="empty">Нет завершённых штрафов</p>
            ) : (
              penalties
                .filter(p => p.workoff_status === 'done')
                .map(penalty => (
                  <PenaltyCard
                    key={penalty.id}
                    penalty={penalty}
                    onStatusChange={() => fetchPenalties()}
                    isDone={true}
                  />
                ))
            )}
          </div>
        </div>

        <div className="penalties-section">
          <h2>❌ Переходящие (не пришёл)</h2>
          <div className="penalties-list">
            {penalties.filter(p => p.workoff_status === 'overdue').length === 0 ? (
              <p className="empty">Нет переходящих штрафов</p>
            ) : (
              penalties
                .filter(p => p.workoff_status === 'overdue')
                .map(penalty => (
                  <PenaltyCard
                    key={penalty.id}
                    penalty={penalty}
                    onStatusChange={() => fetchPenalties()}
                    isOverdue={true}
                  />
                ))
            )}
          </div>
        </div>
      </div>

      <div className="penalties-stats">
        <div className="stat">
          <span>Всего штрафов:</span>
          <strong>{penalties.length}</strong>
        </div>
        <div className="stat">
          <span>Ожидает отработки:</span>
          <strong>{penalties.filter(p => p.workoff_status === 'pending').length}</strong>
        </div>
        <div className="stat">
          <span>Переходящие (×2):</span>
          <strong className="alert">
            {penalties.filter(p => p.workoff_status === 'overdue').length}
          </strong>
        </div>
        <div className="stat">
          <span>Завершено:</span>
          <strong>{penalties.filter(p => p.workoff_status === 'done').length}</strong>
        </div>
      </div>
    </div>
  );
}

function PenaltyCard({ penalty, onStatusChange, isDone, isOverdue }) {
  const handleMarkDone = async () => {
    try {
      await fetch(`/api/penalties/${penalty.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workoff_status: 'done' })
      });
      onStatusChange();
    } catch (error) {
      console.error('Ошибка:', error);
    }
  };

  const handleMarkOverdue = async () => {
    try {
      await fetch(`/api/penalties/${penalty.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workoff_status: 'overdue' })
      });
      onStatusChange();
    } catch (error) {
      console.error('Ошибка:', error);
    }
  };

  return (
    <div className={`penalty-card ${isOverdue ? 'overdue' : ''} ${isDone ? 'done' : ''}`}>
      <div className="penalty-header">
        <h3>{penalty.student_name}</h3>
        <span className="penalty-hours">
          {penalty.total_hours}h{penalty.multiplier > 1 && ` (×${penalty.multiplier})`}
        </span>
      </div>

      <div className="penalty-body">
        <p className="volunteer">Выдал: {penalty.volunteer_name}</p>
        {penalty.description && <p className="description">💭 {penalty.description}</p>}
        <p className="date">📅 {new Date(penalty.date_issued).toLocaleDateString('ru-RU')}</p>
      </div>

      {!isDone && !isOverdue && (
        <div className="penalty-actions">
          <button className="btn-done" onClick={handleMarkDone} title="Отработал">
            <Check size={18} /> Отработал
          </button>
          <button className="btn-overdue" onClick={handleMarkOverdue} title="Не пришёл (×2)">
            <X size={18} /> Не пришёл
          </button>
        </div>
      )}

      {isDone && <p className="status-badge done">✅ Отработано</p>}
      {isOverdue && (
        <p className="status-badge overdue">❌ Переходящий штраф (×{penalty.multiplier})</p>
      )}
    </div>
  );
}

function PenaltyForm({ students, onClose, onSuccess }) {
  const [form, setForm] = useState({
    student_name: '',
    description: ''
  });
  const [filteredStudents, setFilteredStudents] = useState(students);

  const handleStudentSearch = (value) => {
    setForm({ ...form, student_name: value });
    setFilteredStudents(
      students.filter(s => s.toLowerCase().includes(value.toLowerCase()))
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.student_name.trim()) {
      alert('Введите имя студента');
      return;
    }

    try {
      const response = await fetch('/api/penalties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_name: form.student_name,
          description: form.description,
          volunteer_id: 1 // TODO: получить из текущего пользователя
        })
      });

      if (response.ok) {
        alert('✅ Штраф добавлен и синхронизирован с Google Sheets!');
        onSuccess();
      }
    } catch (error) {
      alert('❌ Ошибка: ' + error.message);
    }
  };

  return (
    <form className="penalty-form" onSubmit={handleSubmit}>
      <h2>⚠️ Добавить штраф студенту</h2>

      <div className="form-group">
        <label>Имя студента</label>
        <div className="student-search">
          <input
            type="text"
            placeholder="Начните вводить имя..."
            value={form.student_name}
            onChange={(e) => handleStudentSearch(e.target.value)}
            autoFocus
          />
          {filteredStudents.length > 0 && (
            <div className="suggestions">
              {filteredStudents.map((student) => (
                <div
                  key={student}
                  className="suggestion"
                  onClick={() => {
                    setForm({ ...form, student_name: student });
                    setFilteredStudents([]);
                  }}
                >
                  {student}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="form-group">
        <label>Описание нарушения (опционально)</label>
        <textarea
          placeholder="Например: Опоздал на 30 минут, не следил за порядком..."
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows="3"
        />
      </div>

      <div className="penalty-info-box">
        ⚡ <strong>Штраф = 2 часа отработки</strong>
        <br />
        Если не придёт → ×2 (4 часа), затем ×2 (8 часов) и т.д.
      </div>

      <div className="form-actions">
        <button type="submit" className="btn-penalty-primary">
          ➕ Выдать штраф
        </button>
        <button type="button" className="btn-secondary" onClick={onClose}>
          Отмена
        </button>
      </div>
    </form>
  );
}

export default Penalties;
