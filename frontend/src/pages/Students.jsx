import React, { useState, useEffect } from 'react';
import { Download, FileUp, Plus, Trash2 } from 'lucide-react';
import { api } from '../api';
import '../styles/Students.css';

const HEADER_MAP = {
  nick: 'nick',
  ник: 'nick',
  login: 'nick',
  логин: 'nick',
  name: 'name',
  имя: 'name',
  фио: 'name',
  tribe: 'tribe',
  группа: 'tribe',
  триб: 'tribe',
};

const TRIBES = ['Ленты', 'Короны', 'Олени'];

function splitCsvLine(line, delimiter) {
  const cells = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseStudentsFile(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const delimiter = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';
  const first = splitCsvLine(lines[0], delimiter).map((cell) => HEADER_MAP[cell.toLowerCase()] || null);
  const hasHeader = first.includes('nick') || first.includes('name');
  const columns = hasHeader ? first : ['nick', 'name', 'tribe'];
  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines
    .map((line) => {
      const cells = splitCsvLine(line, delimiter);
      return cells.reduce((student, cell, index) => {
        const key = columns[index];
        if (key) student[key] = cell;
        return student;
      }, {});
    })
    .filter((student) => student.nick || student.name);
}

function Students({ user }) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [tribeFilter, setTribeFilter] = useState('all');
  const [workoffFilter, setWorkoffFilter] = useState('all');

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    try {
      const data = await api.get('/api/students');
      // Сортировать по количеству штрафов (спереди те с больше штрафами)
      data.sort((a, b) => b.total_penalty_hours - a.total_penalty_hours);
      setStudents(data);
    } catch (error) {
      console.error('Ошибка загрузки учеников:', error);
    } finally {
      setLoading(false);
    }
  };

  const tribes = [...new Set(students.map((student) => student.tribe).filter(Boolean))].sort();
  const filteredStudents = students.filter((student) => {
    if (tribeFilter !== 'all' && student.tribe !== tribeFilter) return false;
    if (workoffFilter === 'active' && !student.in_workoff) return false;
    if (workoffFilter === 'overdue' && student.overdue_penalties <= 0) return false;
    if (workoffFilter === 'clean' && student.in_workoff) return false;
    return true;
  });

  if (loading) return <div className="loading">Загрузка учеников...</div>;

  return (
    <div className="page students-page">
      <div className="page-header">
        <div>
          <h1>Ученики бассейна</h1>
          <p className="subtitle">Список всех учеников с их штрафами</p>
        </div>
        <div className="page-actions">
          <button className="btn-secondary" onClick={() => setShowImport(!showImport)}>
            <FileUp size={20} /> Загрузить файл
          </button>
          <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
            <Plus size={20} /> Добавить ученика
          </button>
        </div>
      </div>

      {showImport && (
        <StudentsImport
          onClose={() => setShowImport(false)}
          onSuccess={fetchStudents}
        />
      )}

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
          <strong className="danger">{students.filter(s => s.total_penalty_hours > 0).length}</strong>
        </div>
        <div className="stat">
          <span>В отработке:</span>
          <strong className="warning">{students.filter(s => s.in_workoff).length}</strong>
        </div>
        <div className="stat">
          <span>Ждут разблокировки:</span>
          <strong className="warning">
            {students.reduce((sum, s) => sum + (s.awaiting_unlock_penalties || 0), 0)}
          </strong>
        </div>
        <div className="stat">
          <span>Мероприятий:</span>
          <strong>{students.reduce((sum, s) => sum + (s.events_total || 0), 0)}</strong>
        </div>
      </div>

      <div className="students-filters">
        <label>
          Трайб
          <select value={tribeFilter} onChange={(e) => setTribeFilter(e.target.value)}>
            <option value="all">Все трайбы</option>
            {tribes.map((tribe) => (
              <option value={tribe} key={tribe}>{tribe}</option>
            ))}
          </select>
        </label>
        <label>
          Отработка
          <select value={workoffFilter} onChange={(e) => setWorkoffFilter(e.target.value)}>
            <option value="all">Все статусы</option>
            <option value="active">Сейчас в отработке</option>
            <option value="overdue">Просрочена</option>
            <option value="clean">Без отработки</option>
          </select>
        </label>
      </div>

      <div className="students-table-wrap">
        {filteredStudents.length === 0 ? (
          <div className="empty-state">
            <p>Нет учеников под выбранные фильтры.</p>
          </div>
        ) : (
          <table className="students-table">
            <thead>
              <tr>
                <th>Ученик</th>
                <th>Трайб</th>
                <th>Нарушения</th>
                <th>Отработка</th>
                <th>Мероприятия</th>
                <th>Последние штрафы</th>
                <th>Управление</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map(student => (
                <StudentRow
                  key={student.id}
                  student={student}
                  onDelete={() => fetchStudents()}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StudentsImport({ onClose, onSuccess }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [students, setStudents] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    setResult(null);
    setStudents([]);
    setSelectedFile(file || null);
    if (!file) return;

    setFileName(file.name);
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      const text = await file.text();
      const parsed = parseStudentsFile(text);
      setStudents(parsed);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) {
      alert('Выберите файл');
      return;
    }
    const isXlsx = selectedFile.name.toLowerCase().endsWith('.xlsx');
    if (!isXlsx && students.length === 0) {
      alert('В файле не нашлось строк для импорта');
      return;
    }
    setLoading(true);
    try {
      let res;
      if (isXlsx) {
        const formData = new FormData();
        formData.append('file', selectedFile);
        res = await api.upload('/api/students/import-file', formData);
      } else {
        res = await api.post('/api/students/import', { students });
      }
      setResult(res);
      onSuccess();
    } catch (error) {
      alert('❌ Ошибка: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="student-form import-form">
      <h2>Загрузить учеников из файла</h2>
      <div className="import-grid">
        <div className="form-group">
          <label>CSV или TXT</label>
          <input type="file" accept=".xlsx,.csv,.txt,text/csv,text/plain" onChange={handleFile} />
        </div>
        <div className="import-help">
          <strong>Формат:</strong> лучше скачать XLSX-шаблон. Также поддерживается CSV/TXT: <code>nick,name,tribe</code>.
        </div>
      </div>
      <a
        className="btn-secondary template-button"
        href="/templates/students-template.xlsx"
        download="students-template.xlsx"
      >
        <Download size={16} /> Скачать шаблон
      </a>

      {fileName && selectedFile?.name.toLowerCase().endsWith('.xlsx') && (
        <div className="import-preview">
          <div className="import-summary">
            <span>Файл: {fileName}</span>
            <strong>XLSX загрузится при импорте</strong>
          </div>
        </div>
      )}

      {fileName && !selectedFile?.name.toLowerCase().endsWith('.xlsx') && (
        <div className="import-preview">
          <div className="import-summary">
            <span>Файл: {fileName}</span>
            <strong>Найдено строк: {students.length}</strong>
          </div>
          {students.slice(0, 5).map((student, index) => (
            <div className="import-row" key={`${student.nick}-${index}`}>
              <span>@{student.nick || '—'}</span>
              <span>{student.name || '—'}</span>
              <span>{student.tribe || TRIBES[0]}</span>
            </div>
          ))}
          {students.length > 5 && <p className="text-muted">И ещё {students.length - 5} строк...</p>}
        </div>
      )}

      {result && (
        <div className="alert success">
          {result.message}
          {result.skipped?.length > 0 && ` Пропущено строк: ${result.skipped.length}.`}
        </div>
      )}

      <div className="form-actions">
        <button type="button" className="btn-primary" onClick={handleImport} disabled={loading || !selectedFile}>
          {loading ? 'Загружаю...' : 'Импортировать'}
        </button>
        <button type="button" className="btn-secondary" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </section>
  );
}

function StudentRow({ student, onDelete }) {
  const handleDelete = async () => {
    if (!window.confirm(`Удалить ученика ${student.name}?`)) return;

    try {
      await api.del(`/api/students/${student.id}`);
      onDelete();
    } catch (error) {
      alert('Ошибка: ' + error.message);
    }
  };

  const hasPenalties = student.total_penalty_hours > 0 || student.violations_count > 0;
  const rowClass = student.overdue_penalties > 0 ? 'overdue' : student.in_workoff ? 'in-workoff' : '';
  const latestPenalties = student.penalties?.slice(0, 3) || [];

  return (
    <tr className={rowClass}>
      <td>
        <div className="student-person">
          <strong>@{student.nick}</strong>
          <span>{student.name}</span>
        </div>
      </td>
      <td>
        {student.tribe ? <span className="tribe-badge">{student.tribe}</span> : <span className="text-muted">—</span>}
      </td>
      <td>
        {hasPenalties ? (
          <div className="student-counts">
            <strong>{student.violations_count}</strong>
            <span>{student.total_penalty_hours}h штрафа</span>
          </div>
        ) : (
          <span className="no-penalties">Нет</span>
        )}
      </td>
      <td>
        {student.in_workoff ? (
          <div className="workoff-stack">
            <span className={`workoff-pill ${student.overdue_penalties > 0 ? 'overdue' : 'active'}`}>
              {student.overdue_penalties > 0 ? 'Просрочена' : 'В отработке'}
            </span>
            <small>ожидает: {student.pending_penalties}, просрочено: {student.overdue_penalties}</small>
          </div>
        ) : (
          <span className="workoff-pill clean">Нет отработки</span>
        )}
      </td>
      <td>
        <div className="student-events">
          <strong>{student.events_total || 0}</strong>
          <span>развл.: {student.entertainment_events || 0}</span>
          <span>обуч.: {student.education_events || 0}</span>
          <span>баллы: {student.event_points || 0}</span>
        </div>
      </td>
      <td>
        {latestPenalties.length > 0 ? (
          <div className="penalties-list compact">
          {latestPenalties.map((penalty, idx) => (
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
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td>
        <div className="student-actions">
          <button className="btn-delete" onClick={handleDelete} title="Удалить">
            <Trash2 size={18} />
          </button>
        </div>
      </td>
    </tr>
  );
}

function StudentForm({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    nick: '',
    name: '',
    tribe: TRIBES[0]
  });

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.nick.trim() || !form.name.trim()) {
      alert('Заполните все поля');
      return;
    }

    try {
      await api.post('/api/students', form);
      onSuccess();
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
            {TRIBES.map((tribe) => (
              <option value={tribe} key={tribe}>{tribe}</option>
            ))}
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
