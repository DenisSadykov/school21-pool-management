import React, { useState, useEffect } from 'react';
import { AlertCircle, Plus, Check, X, Trash2 } from 'lucide-react';
import { api } from '../api';
import '../styles/Penalties.css';

const STATUS_LABELS = {
  pending: 'ожидает отработки',
  overdue: 'не пришёл',
  awaiting_unlock: 'ждёт разблокировки',
  unlocked: 'разблокирован',
  done: 'отработал',
};

function Penalties() {
  const [penalties, setPenalties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [students, setStudents] = useState([]);

  useEffect(() => {
    fetchPenalties();
    api.get('/api/students')
      .then((data) => setStudents(data.map((s) => s.nick)))
      .catch(() => setStudents([]));
  }, []);

  const fetchPenalties = async () => {
    try {
      const data = await api.get('/api/penalties');
      setPenalties(data);
    } catch (error) {
      console.error('Ошибка загрузки штрафов:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="loading">Загрузка штрафов...</div>;
  const activePenalties = penalties.filter((p) => p.workoff_status !== 'unlocked');

  return (
    <div className="page penalties-page">
      <div className="page-header">
        <div>
          <h1>Штрафы учеников</h1>
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
            <br />
            <strong>Логика ×2:</strong> Если студент НЕ пришёл на отработку, нажми "Не пришёл"
            на ОДИН ШТРАФ и он умножится (2h → 4h → 8h → 16h...).
            <br />
            <strong>Удалить:</strong> Если выдал штраф случайно, нажми значок корзины.
          </div>
        </div>
      </div>

      <div className="penalties-grid">
        <div className="penalties-section">
          <h2>Ожидание отработки</h2>
          <div className="penalties-list">
            {activePenalties.filter(p => p.workoff_status === 'pending').length === 0 ? (
              <p className="empty">Нет активных штрафов</p>
            ) : (
              activePenalties
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

        <div className="penalties-section unlock-section">
          <h2>Ждут разблокировки</h2>
          <div className="penalties-list">
            {activePenalties.filter(p => p.workoff_status === 'awaiting_unlock').length === 0 ? (
              <p className="empty">Никто не ждёт разблокировки</p>
            ) : (
              activePenalties
                .filter(p => p.workoff_status === 'awaiting_unlock')
                .map(penalty => (
                  <PenaltyCard
                    key={penalty.id}
                    penalty={penalty}
                    onStatusChange={() => fetchPenalties()}
                    isAwaitingUnlock={true}
                  />
                ))
            )}
          </div>
        </div>

        <div className="penalties-section">
          <h2>Переходящие (не пришёл)</h2>
          <div className="penalties-list">
            {activePenalties.filter(p => p.workoff_status === 'overdue').length === 0 ? (
              <p className="empty">Нет переходящих штрафов</p>
            ) : (
              activePenalties
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
          <strong>{activePenalties.length}</strong>
        </div>
        <div className="stat">
          <span>Ожидает отработки:</span>
          <strong>{activePenalties.filter(p => p.workoff_status === 'pending').length}</strong>
        </div>
        <div className="stat">
          <span>Переходящие (×2):</span>
          <strong className="danger">
            {activePenalties.filter(p => p.workoff_status === 'overdue').length}
          </strong>
        </div>
        <div className="stat">
          <span>Ждут разблокировки:</span>
          <strong>{activePenalties.filter(p => p.workoff_status === 'awaiting_unlock').length}</strong>
        </div>
      </div>
    </div>
  );
}

function PenaltyCard({ penalty, onStatusChange, isAwaitingUnlock, isOverdue }) {
  const handleMarkDone = async () => {
    if (!window.confirm(`Отметить что ${penalty.student_name} отработал ${penalty.total_hours} часов?`)) return;

    try {
      await api.patch(`/api/penalties/${penalty.id}`, { workoff_status: 'awaiting_unlock' });
      onStatusChange();
    } catch (error) {
      console.error('Ошибка:', error);
      alert('❌ Ошибка: ' + error.message);
    }
  };

  const handleUnlock = async () => {
    if (!window.confirm(`${penalty.student_name} разблокирован на учебной платформе?`)) return;

    try {
      await api.patch(`/api/penalties/${penalty.id}`, { workoff_status: 'unlocked' });
      onStatusChange();
    } catch (error) {
      console.error('Ошибка:', error);
      alert('❌ Ошибка: ' + error.message);
    }
  };

  const handleMarkPending = async () => {
    if (!window.confirm(`Отменить отработку для ${penalty.student_name}?`)) return;

    try {
      await api.patch(`/api/penalties/${penalty.id}`, { workoff_status: 'pending' });
      onStatusChange();
    } catch (error) {
      console.error('Ошибка:', error);
      alert('❌ Ошибка: ' + error.message);
    }
  };

  const handleMarkOverdue = async () => {
    const newHours = penalty.total_hours * 2;
    if (!window.confirm(`Ученик не пришёл на отработку?\n${penalty.total_hours}h → ${newHours}h`)) return;

    try {
      await api.patch(`/api/penalties/${penalty.id}`, { workoff_status: 'overdue' });
      onStatusChange();
    } catch (error) {
      console.error('Ошибка:', error);
      alert('❌ Ошибка: ' + error.message);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Удалить штраф для ${penalty.student_name}?\nЭто действие нельзя отменить.`)) return;

    try {
      await api.del(`/api/penalties/${penalty.id}`);
      onStatusChange();
    } catch (error) {
      console.error('Ошибка:', error);
      alert('❌ Ошибка: ' + error.message);
    }
  };

  return (
    <div className={`penalty-card ${isOverdue ? 'overdue' : ''} ${isAwaitingUnlock ? 'awaiting-unlock' : ''}`}>
      <div className="penalty-header">
        <h3>{penalty.student_name}</h3>
        <span className="penalty-hours">
          {penalty.total_hours}h{penalty.multiplier > 1 && ` (×${penalty.multiplier})`}
        </span>
      </div>

      <div className="penalty-body">
        <p className="volunteer">Выдал: {penalty.volunteer_name}</p>
        {penalty.description && <p className="description">💭 {penalty.description}</p>}
        <p className="date">{new Date(penalty.date_issued).toLocaleDateString('ru-RU')}</p>
        {penalty.date_worked_off && (
          <p className="date">Отработал: {new Date(penalty.date_worked_off).toLocaleString('ru-RU')}</p>
        )}
      </div>

      {penalty.history?.length > 0 && (
        <details className="penalty-history">
          <summary>История</summary>
          <div className="history-list">
            {penalty.history.map((item) => (
              <div className="history-item" key={item.id}>
                <strong>{STATUS_LABELS[item.new_status] || item.new_status}</strong>
                <span>
                  {item.old_status ? `${STATUS_LABELS[item.old_status] || item.old_status} → ` : ''}
                  {STATUS_LABELS[item.new_status] || item.new_status}
                  {item.new_hours ? ` · ${item.new_hours}h` : ''}
                </span>
                <small>
                  {item.actor_nick ? `@${item.actor_nick}` : 'система'} · {new Date(item.created_at).toLocaleString('ru-RU')}
                </small>
              </div>
            ))}
          </div>
        </details>
      )}

      {!isAwaitingUnlock && (
        <div className="penalty-actions">
          <button className="btn-done" onClick={handleMarkDone} title="Отработал">
            <Check size={18} /> Отработал
          </button>
          <button className="btn-overdue" onClick={handleMarkOverdue} title="Не пришёл (×2)">
            <X size={18} /> Не пришёл
          </button>
          <button className="btn-delete" onClick={handleDelete} title="Удалить штраф">
            <Trash2 size={18} />
          </button>
        </div>
      )}

      {isAwaitingUnlock && (
        <div className="penalty-actions">
          <p className="status-badge done">Ждёт разблокировки</p>
          <button className="btn-done" onClick={handleUnlock} title="Разблокирован">
            <Check size={18} /> Разблокирован
          </button>
          <button className="btn-cancel" onClick={handleMarkPending} title="Отменить отработку">
            ↶ Отменить
          </button>
          <button className="btn-delete" onClick={handleDelete} title="Удалить штраф">
            <Trash2 size={18} />
          </button>
        </div>
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
      await api.post('/api/penalties', {
        student_name: form.student_name,
        description: form.description,
      });
      onSuccess();
    } catch (error) {
      alert('❌ Ошибка: ' + error.message);
    }
  };

  return (
    <form className="penalty-form" onSubmit={handleSubmit}>
      <h2>Добавить штраф студенту</h2>

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
