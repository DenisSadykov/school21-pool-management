import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { AlertCircle, Plus, Check, X, Trash2, ExternalLink } from 'lucide-react';
import { api } from '../api';
import Loader from '../components/Loader';
import '../styles/Pages.css';
import '../styles/Penalties.css';

const STATUS_LABELS = {
  pending: 'ожидает отработки',
  in_workoff: 'отрабатывает',
  overdue: 'не пришёл',
  awaiting_unlock: 'ждёт разблокировки',
  unlocked: 'разблокирован',
  done: 'отработал',
};

const getWorkoffNote = (penalty) => [...(penalty.history || [])]
  .reverse()
  .find(item => item.new_status === 'in_workoff' && item.comment)?.comment || '';

const formatStatusLabel = (status) => {
  const label = STATUS_LABELS[status] || status || '';
  return label ? `${label.charAt(0).toUpperCase()}${label.slice(1)}` : '';
};

const normalizeStudentName = (value) => (value || '').trim().toLowerCase();

function Penalties({ user }) {
  const location = useLocation();
  const [penalties, setPenalties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [students, setStudents] = useState([]);
  const [error, setError] = useState('');
  const [highlightedStatus, setHighlightedStatus] = useState('');
  const [highlightedPenaltyId, setHighlightedPenaltyId] = useState(null);
  const [deletingPenaltyId, setDeletingPenaltyId] = useState(null);
  const sectionRefs = useRef({});
  const penaltyRefs = useRef({});
  const penaltyTargetTimerRef = useRef(null);
  const highlightTimerRef = useRef(null);

  const scrollToStatus = (status) => {
    const target = sectionRefs.current[status === 'all' ? 'pending' : status];
    if (!target) return;

    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setHighlightedStatus(status);

    if (highlightTimerRef.current) {
      window.clearTimeout(highlightTimerRef.current);
    }

    highlightTimerRef.current = window.setTimeout(() => {
      setHighlightedStatus('');
      highlightTimerRef.current = null;
    }, 1800);
  };

  useEffect(() => {
    fetchPenalties();
    api.get('/api/students')
      .then((data) => setStudents(data.map((s) => ({ id: s.id, nick: s.nick }))))
      .catch(() => setStudents([]));

    return () => {
      if (highlightTimerRef.current) {
        window.clearTimeout(highlightTimerRef.current);
      }
      if (penaltyTargetTimerRef.current) {
        window.clearTimeout(penaltyTargetTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    const params = new URLSearchParams(location.search);
    const status = params.get('status');
    const student = params.get('student');
    if (!status && !student) return;

    if (status) {
      scrollToStatus(status);
    }

    if (!student) return;

    const targetPenalty = penalties.find((penalty) => (
      penalty.workoff_status === status
      && normalizeStudentName(penalty.student_name) === normalizeStudentName(student)
    )) || penalties.find((penalty) => (
      normalizeStudentName(penalty.student_name) === normalizeStudentName(student)
    ));

    if (!targetPenalty) return;

    window.requestAnimationFrame(() => {
      const node = penaltyRefs.current[targetPenalty.id];
      if (!node) return;

      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedPenaltyId(targetPenalty.id);

      if (penaltyTargetTimerRef.current) {
        window.clearTimeout(penaltyTargetTimerRef.current);
      }

      penaltyTargetTimerRef.current = window.setTimeout(() => {
        setHighlightedPenaltyId(null);
        penaltyTargetTimerRef.current = null;
      }, 2200);
    });
  }, [loading, location.search, penalties]);

  const fetchPenalties = async () => {
    setError('');
    try {
      const data = await api.get('/api/penalties');
      setPenalties(data);
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteWorkedOffPenalty = async (penalty) => {
    if (!window.confirm(`Удалить отработанный штраф для ${penalty.student_name}?\nЭто действие нельзя отменить.`)) return;

    setDeletingPenaltyId(penalty.id);
    try {
      await api.del(`/api/penalties/${penalty.id}`);
      setPenalties((current) => current.filter((item) => item.id !== penalty.id));
    } catch (deleteError) {
      alert('❌ Ошибка: ' + deleteError.message);
    } finally {
      setDeletingPenaltyId(null);
    }
  };

  if (loading) return <Loader text="Загрузка штрафов..." />;
  const isStaff = user?.role === 'admin' || user?.role === 'team_lead';
  const activePenalties = penalties.filter((p) => p.workoff_status !== 'unlocked');
  const workedOffPenalties = penalties
    .filter((p) => ['awaiting_unlock', 'unlocked', 'done'].includes(p.workoff_status) && p.date_worked_off)
    .sort((a, b) => new Date(b.date_worked_off) - new Date(a.date_worked_off));

  return (
    <div className="page penalties-page">
      <div className="page-header">
        <div className="penalties-title-wrap">
          <h1>Штрафы учеников</h1>
          <button
            type="button"
            className="penalties-info-trigger"
            onClick={() => setShowInfo(true)}
            aria-label="Показать правила штрафов"
            title="Показать правила штрафов"
          >
            <AlertCircle size={18} />
          </button>
        </div>
        <div className="penalties-header-actions">
          <a
            className="btn-penalty-secondary"
            href="https://applicant.21-school.ru/rules"
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={18} /> Правила школы
          </a>
          <button
            className="btn-penalty-primary"
            onClick={() => setShowForm(!showForm)}
          >
            <Plus size={24} /> Добавить штраф
          </button>
        </div>
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

      {showInfo && (
        <div className="penalties-modal-backdrop" onClick={() => setShowInfo(false)}>
          <div
            className="penalties-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="penalties-info-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="penalties-modal-head">
              <div className="penalties-modal-title">
                <AlertCircle size={18} />
                <h2 id="penalties-info-title">Правила штрафов</h2>
              </div>
              <button
                type="button"
                className="penalties-modal-close"
                onClick={() => setShowInfo(false)}
                aria-label="Закрыть"
              >
                <X size={16} />
              </button>
            </div>
            <div className="penalties-modal-body">
              <p><strong>Система штрафов:</strong> Каждое нарушение = 2 часа отработки.</p>
              <p><strong>Логика ×2:</strong> Если студент НЕ пришёл на отработку, нажми "Не пришёл" на ОДИН ШТРАФ и он умножится (2h → 4h → 8h → 16h...).</p>
              <p><strong>Удалить:</strong> Если выдал штраф случайно, нажми значок корзины.</p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="page-error">
          <p>{error}</p>
          <button type="button" className="btn-secondary" onClick={fetchPenalties}>
            Повторить
          </button>
        </div>
      )}

      {!error && (
        <>
      <div className="penalties-stats">
        <button type="button" className="stat" onClick={() => scrollToStatus('all')}>
          <span>Всего штрафов:</span>
          <strong>{activePenalties.length}</strong>
        </button>
        <button type="button" className="stat" onClick={() => scrollToStatus('pending')}>
          <span>Ожидает отработки:</span>
          <strong>{activePenalties.filter(p => p.workoff_status === 'pending').length}</strong>
        </button>
        <button type="button" className="stat" onClick={() => scrollToStatus('in_workoff')}>
          <span>Отрабатывают:</span>
          <strong>{activePenalties.filter(p => p.workoff_status === 'in_workoff').length}</strong>
        </button>
        <button type="button" className="stat" onClick={() => scrollToStatus('awaiting_unlock')}>
          <span>Ждут разблокировки:</span>
          <strong>{activePenalties.filter(p => p.workoff_status === 'awaiting_unlock').length}</strong>
        </button>
        <button type="button" className="stat" onClick={() => scrollToStatus('overdue')}>
          <span>Переходящие (×2):</span>
          <strong className="danger">
            {activePenalties.filter(p => p.workoff_status === 'overdue').length}
          </strong>
        </button>
      </div>
        </>
      )}

      {!error && (
        <>
      <div className="penalties-grid">
        <div
          className={`penalties-section ${highlightedStatus === 'all' || highlightedStatus === 'pending' ? 'is-highlighted' : ''}`}
          ref={(node) => { sectionRefs.current.pending = node; }}
        >
          <h2>Ожидание отработки</h2>
          <div className={`penalties-list ${activePenalties.filter(p => p.workoff_status === 'pending').length === 0 ? 'is-empty' : ''}`}>
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
                    canDelete={isStaff}
                    isTarget={highlightedPenaltyId === penalty.id}
                    registerRef={(node) => { penaltyRefs.current[penalty.id] = node; }}
                  />
                ))
            )}
          </div>
        </div>

        <div
          className={`penalties-section workoff-section ${highlightedStatus === 'in_workoff' ? 'is-highlighted' : ''}`}
          ref={(node) => { sectionRefs.current.in_workoff = node; }}
        >
          <h2>Отрабатывают</h2>
          <div className={`penalties-list ${activePenalties.filter(p => p.workoff_status === 'in_workoff').length === 0 ? 'is-empty' : ''}`}>
            {activePenalties.filter(p => p.workoff_status === 'in_workoff').length === 0 ? (
              <p className="empty">Пока никто не отрабатывает</p>
            ) : (
              activePenalties
                .filter(p => p.workoff_status === 'in_workoff')
                .map(penalty => (
                  <PenaltyCard
                    key={penalty.id}
                    penalty={penalty}
                    onStatusChange={() => fetchPenalties()}
                    canDelete={isStaff}
                    isInWorkoff={true}
                    isTarget={highlightedPenaltyId === penalty.id}
                    registerRef={(node) => { penaltyRefs.current[penalty.id] = node; }}
                  />
                ))
            )}
          </div>
        </div>

        <div
          className={`penalties-section unlock-section ${highlightedStatus === 'awaiting_unlock' ? 'is-highlighted' : ''}`}
          ref={(node) => { sectionRefs.current.awaiting_unlock = node; }}
        >
          <h2>Ждут разблокировки</h2>
          <div className={`penalties-list ${activePenalties.filter(p => p.workoff_status === 'awaiting_unlock').length === 0 ? 'is-empty' : ''}`}>
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
                    canDelete={isStaff}
                    isAwaitingUnlock={true}
                    isTarget={highlightedPenaltyId === penalty.id}
                    registerRef={(node) => { penaltyRefs.current[penalty.id] = node; }}
                  />
                ))
            )}
          </div>
        </div>

        <div
          className={`penalties-section ${highlightedStatus === 'overdue' ? 'is-highlighted' : ''}`}
          ref={(node) => { sectionRefs.current.overdue = node; }}
        >
          <h2>Переходящие (не пришёл)</h2>
          <div className={`penalties-list ${activePenalties.filter(p => p.workoff_status === 'overdue').length === 0 ? 'is-empty' : ''}`}>
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
                    canDelete={isStaff}
                    isOverdue={true}
                    isTarget={highlightedPenaltyId === penalty.id}
                    registerRef={(node) => { penaltyRefs.current[penalty.id] = node; }}
                  />
                ))
            )}
          </div>
        </div>
      </div>

      <div className="worked-off-section">
        <div className="section-title-row">
          <h2>Отработанные пенальти</h2>
          <span>{workedOffPenalties.length}</span>
        </div>
        {workedOffPenalties.length === 0 ? (
          <p className="empty worked-off-empty">Пока нет отработанных пенальти</p>
        ) : (
          <div className="worked-off-list">
            {workedOffPenalties.map((penalty) => {
              const workoffNote = getWorkoffNote(penalty);
              return (
                <div className={`worked-off-row ${isStaff ? 'has-actions' : ''}`} key={penalty.id}>
                  <div>
                    <strong>{penalty.student_name}</strong>
                    <span>{STATUS_LABELS[penalty.workoff_status] || penalty.workoff_status}</span>
                  </div>
                  <div>
                    <small>Когда</small>
                    <span>{new Date(penalty.date_worked_off).toLocaleString('ru-RU')}</span>
                  </div>
                  <div>
                    <small>Как отработал</small>
                    <span>{workoffNote || 'Комментарий не указан'}</span>
                  </div>
                  <div>
                    <small>Часы</small>
                    <span>{penalty.total_hours}h</span>
                  </div>
                  {isStaff && (
                    <button
                      type="button"
                      className="worked-off-delete"
                      onClick={() => deleteWorkedOffPenalty(penalty)}
                      disabled={deletingPenaltyId === penalty.id}
                      aria-label={`Удалить отработанный штраф для ${penalty.student_name}`}
                      title="Удалить запись"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
        </>
      )}
    </div>
  );
}

function PenaltyCard({ penalty, onStatusChange, canDelete, isAwaitingUnlock, isOverdue, isInWorkoff, isTarget, registerRef }) {
  const workoffNote = getWorkoffNote(penalty);

  const handleStartWorkoff = async () => {
    const comment = window.prompt('Как отрабатывает? Комментарий можно оставить пустым.', '');
    if (comment === null) return;

    try {
      await api.patch(`/api/penalties/${penalty.id}`, { workoff_status: 'in_workoff', comment });
      onStatusChange();
    } catch (error) {
      console.error('Ошибка:', error);
      alert('❌ Ошибка: ' + error.message);
    }
  };

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
    <div
      ref={registerRef}
      className={`penalty-card ${isOverdue ? 'overdue' : ''} ${isAwaitingUnlock ? 'awaiting-unlock' : ''} ${isInWorkoff ? 'in-workoff' : ''} ${isTarget ? 'is-target' : ''}`}
    >
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
        {penalty.date_worked_off && penalty.workoff_status !== 'in_workoff' && (
          <p className="date">Отработал: {new Date(penalty.date_worked_off).toLocaleString('ru-RU')}</p>
        )}
        {penalty.workoff_started_at && (
          <p className="date">Начал: {new Date(penalty.workoff_started_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</p>
        )}
        {isInWorkoff && workoffNote && (
          <p className="workoff-note">Как отрабатывает: {workoffNote}</p>
        )}
      </div>

      {penalty.history?.length > 0 && (
        <details className="penalty-history">
          <summary>История</summary>
          <div className="history-list">
            {penalty.history.map((item) => (
              <div className="history-item" key={item.id}>
                <strong>{formatStatusLabel(item.new_status)}</strong>
                <span>
                  {item.old_status ? `${formatStatusLabel(item.old_status)} → ` : ''}
                  {formatStatusLabel(item.new_status)}
                  {item.new_hours ? ` · ${item.new_hours}h` : ''}
                </span>
                <small>
                  {item.actor_nick ? `@${item.actor_nick}` : 'система'} · {new Date(item.created_at).toLocaleString('ru-RU')}
                </small>
                {item.comment && <em>{item.comment}</em>}
              </div>
            ))}
          </div>
        </details>
      )}

      {penalty.workoff_status === 'pending' && (
        <div className={`penalty-actions ${canDelete ? '' : 'no-delete'}`}>
          <button className="btn-done" onClick={handleStartWorkoff} title="Начал отработку">
            <Check size={18} /> Начал отработку
          </button>
          <button className="btn-overdue" onClick={handleMarkOverdue} title="Не пришёл (×2)">
            <X size={18} /> Не пришёл
          </button>
          {canDelete && (
            <button className="btn-delete" onClick={handleDelete} title="Удалить штраф">
              <Trash2 size={18} />
            </button>
          )}
        </div>
      )}

      {isInWorkoff && (
        <div className={`penalty-actions ${canDelete ? '' : 'no-delete'}`}>
          <button className="btn-done" onClick={handleMarkDone} title="Отработал">
            <Check size={18} /> Отработал
          </button>
          <button className="btn-cancel" onClick={handleMarkPending} title="Вернуть в ожидание">
            ↶ Вернуть в ожидание
          </button>
          {canDelete && (
            <button className="btn-delete" onClick={handleDelete} title="Удалить штраф">
              <Trash2 size={18} />
            </button>
          )}
        </div>
      )}

      {isOverdue && (
        <div className={`penalty-actions ${canDelete ? '' : 'no-delete'}`}>
          <button className="btn-done" onClick={handleStartWorkoff} title="Начал отработку">
            <Check size={18} /> Начал отработку
          </button>
          <button className="btn-cancel" onClick={handleMarkPending} title="Вернуть в ожидание">
            ↶ В ожидание
          </button>
          {canDelete && (
            <button className="btn-delete" onClick={handleDelete} title="Удалить штраф">
              <Trash2 size={18} />
            </button>
          )}
        </div>
      )}

      {isAwaitingUnlock && (
        <div className={`penalty-actions ${canDelete ? '' : 'no-delete'}`}>
          <button className="btn-done" onClick={handleUnlock} title="Разблокирован">
            <Check size={18} /> Разблокирован
          </button>
          <button className="btn-cancel" onClick={handleMarkPending} title="Отменить отработку">
            ↶ Отменить
          </button>
          {canDelete && (
            <button className="btn-delete" onClick={handleDelete} title="Удалить штраф">
              <Trash2 size={18} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function PenaltyForm({ students, onClose, onSuccess }) {
  const [form, setForm] = useState({
    student_id: null,
    student_name: '',
    description: ''
  });
  const [filteredStudents, setFilteredStudents] = useState(students);

  const handleStudentSearch = (value) => {
    setForm({ ...form, student_id: null, student_name: value });
    setFilteredStudents(
      students.filter(s => s.nick.toLowerCase().includes(value.toLowerCase()))
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.student_id) {
      alert('Выберите ученика из списка активного бассейна');
      return;
    }

    try {
      await api.post('/api/penalties', {
        student_id: form.student_id,
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
                  key={student.id}
                  className="suggestion"
                  onClick={() => {
                    setForm({ ...form, student_id: student.id, student_name: student.nick });
                    setFilteredStudents([]);
                  }}
                >
                  {student.nick}
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
