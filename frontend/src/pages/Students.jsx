import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, FileUp, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { api, downloadFile } from '../api';
import Loader from '../components/Loader';
import TribeLabel from '../components/TribeLabel';
import '../styles/Pages.css';
import '../styles/Students.css';

const HEADER_MAP = {
  nick: 'nick',
  ник: 'nick',
  login: 'nick',
  логин: 'nick',
  'ник школьный': 'nick',
  name: 'name',
  имя: 'name',
  фио: 'name',
  tribe: 'tribe',
  группа: 'tribe',
  триб: 'tribe',
  трайб: 'tribe',
};

const PENALTY_STATUS_LABELS = {
  clean: 'Все ок',
  received: 'Ждёт отработки',
  workoff: 'Отрабатывает',
  awaiting_unlock: 'Ждёт разблокировки',
};

const PENALTY_ROUTE_STATUS = {
  received: 'pending',
  workoff: 'in_workoff',
  awaiting_unlock: 'awaiting_unlock',
};

const PENALTY_ITEM_LABELS = {
  pending: 'получил',
  in_workoff: 'отрабатывает',
  overdue: 'не пришёл',
  awaiting_unlock: 'ждёт разблокировки',
  done: 'отработано',
  unlocked: 'разблокирован',
};

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
  const hasHeader = first.includes('nick') || first.includes('name') || first.includes('tribe');
  const columns = hasHeader ? first : ['nick', 'tribe'];
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
    .filter((student) => student.nick);
}

function Students({ user }) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [tribeFilter, setTribeFilter] = useState('all');
  const [workoffFilter, setWorkoffFilter] = useState('all');
  const [definedTribes, setDefinedTribes] = useState([]);
  const [error, setError] = useState('');
  const isStaff = user.role === 'team_lead' || user.role === 'admin';

  useEffect(() => {
    fetchStudents();
    fetchTribes();
  }, []);

  const fetchStudents = async () => {
    setError('');
    try {
      const data = await api.get('/api/students');
      // Сортировать по количеству штрафов (спереди те с больше штрафами)
      data.sort((a, b) => b.total_penalty_hours - a.total_penalty_hours);
      setStudents(data);
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchTribes = async () => {
    try {
      const data = await api.get('/api/tribes');
      setDefinedTribes((data || []).map((tribe) => tribe.name));
    } catch (error) {
      console.error('Ошибка загрузки трайбов:', error);
    }
  };

  const tribes = [...new Set(students.map((student) => student.tribe).filter(Boolean))].sort();
  const filteredStudents = students.filter((student) => {
    if (tribeFilter !== 'all' && student.tribe !== tribeFilter) return false;
    if (workoffFilter !== 'all' && (student.penalty_status || 'clean') !== workoffFilter) return false;
    return true;
  });

  if (loading) return <Loader text="Загрузка учеников..." />;

  return (
    <div className="page students-page">
      <div className="page-header">
        <div>
          <h1>Ученики бассейна</h1>
        </div>
        {isStaff && (
          <div className="page-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => downloadFile('/api/students/export-penalties.xlsx', 'student-penalties.xlsx')}
            >
              <Download size={16} /> Скачать штрафы
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => downloadFile('/api/students/export-events.xlsx', 'student-events.xlsx')}
            >
              <Download size={16} /> Скачать мероприятия
            </button>
            <button className="btn-secondary" onClick={() => setShowImport(!showImport)}>
              <FileUp size={20} /> Загрузить файлом
            </button>
            <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
              <Plus size={20} /> Добавить ученика
            </button>
          </div>
        )}
      </div>

      {error ? (
        <div className="page-error">
          <p>{error}</p>
          <button type="button" className="btn-secondary" onClick={fetchStudents}>
            Повторить
          </button>
        </div>
      ) : (
        <>
      {showImport && (
        <StudentsImport
          tribes={definedTribes}
          onClose={() => setShowImport(false)}
          onSuccess={fetchStudents}
        />
      )}

      {showForm && (
        <StudentForm
          tribes={definedTribes}
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
          Статус
          <select value={workoffFilter} onChange={(e) => setWorkoffFilter(e.target.value)}>
            <option value="all">Все статусы</option>
            <option value="clean">Все ок</option>
            <option value="received">Ждёт отработки</option>
            <option value="workoff">Отрабатывает</option>
            <option value="awaiting_unlock">Ждёт разблокировки</option>
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
                <th>Мероприятия</th>
                <th>Статус</th>
                <th>Штрафы</th>
                <th>Управление</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map(student => (
                <StudentRow
                  key={student.id}
                  student={student}
                  tribes={definedTribes}
                  canManage={isStaff}
                  onDelete={() => fetchStudents()}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
        </>
      )}
    </div>
  );
}

function StudentsImport({ tribes, onClose, onSuccess }) {
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
      <div className="import-help">
        <strong>Формат:</strong> лучше скачать XLSX-шаблон. Также поддерживается CSV/TXT: <code>nick,tribe</code>.
        {tribes.length > 0 && <span> В шаблоне трайб выбирается из списка: {tribes.join(', ')}.</span>}
        <button
          type="button"
          className="btn-secondary template-button inline-template-button"
          onClick={() => downloadFile('/api/students/template', 'students-template.xlsx')}
        >
          <Download size={16} /> Скачать шаблон
        </button>
      </div>

      <div className="import-toolbar">
        <div className="form-group import-file-group">
          <label className="sr-only">XLSX, CSV или TXT</label>
          <input type="file" accept=".xlsx,.csv,.txt,text/csv,text/plain" onChange={handleFile} />
        </div>
        <div className="import-actions">
          <button type="button" className="btn-primary" onClick={handleImport} disabled={loading || !selectedFile}>
            {loading ? 'Загружаю...' : 'Импортировать'}
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>

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
              <span>{student.tribe || '—'}</span>
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
    </section>
  );
}

function StudentRow({ student, tribes, canManage, onDelete }) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [penaltiesOpen, setPenaltiesOpen] = useState(false);
  const [penaltiesPosition, setPenaltiesPosition] = useState({ top: 0, left: 0 });
  const menuButtonRef = useRef(null);
  const menuRef = useRef(null);
  const penaltiesButtonRef = useRef(null);
  const penaltiesRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const handleOutsideClick = (event) => {
      if (
        menuRef.current?.contains(event.target)
        || menuButtonRef.current?.contains(event.target)
      ) {
        return;
      }
      setMenuOpen(false);
    };

    const handleCloseMenu = () => setMenuOpen(false);

    document.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('scroll', handleCloseMenu, true);
    window.addEventListener('resize', handleCloseMenu);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('scroll', handleCloseMenu, true);
      window.removeEventListener('resize', handleCloseMenu);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!penaltiesOpen) return undefined;

    const handleOutsideClick = (event) => {
      if (
        penaltiesRef.current?.contains(event.target)
        || penaltiesButtonRef.current?.contains(event.target)
      ) {
        return;
      }
      setPenaltiesOpen(false);
    };

    const handleClose = () => setPenaltiesOpen(false);

    document.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('scroll', handleClose, true);
    window.addEventListener('resize', handleClose);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('scroll', handleClose, true);
      window.removeEventListener('resize', handleClose);
    };
  }, [penaltiesOpen]);

  const handleDelete = async () => {
    if (!window.confirm(`Удалить ученика @${student.nick}?`)) return;

    try {
      await api.del(`/api/students/${student.id}`);
      onDelete();
    } catch (error) {
      alert('Ошибка: ' + error.message);
    }
  };

  const handleChangeTribe = async (tribe) => {
    try {
      await api.patch(`/api/students/${student.id}`, { tribe });
      setMenuOpen(false);
      onDelete();
    } catch (error) {
      alert('Ошибка: ' + error.message);
    }
  };

  const handleCopyNick = async () => {
    if (!student.nick) return;
    try {
      await navigator.clipboard.writeText(student.nick);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch (error) {
      console.error('Ошибка копирования ника:', error);
    }
  };

  const handleOpenPenaltyStatus = () => {
    const status = PENALTY_ROUTE_STATUS[student.penalty_status];
    if (!status) return;

    const params = new URLSearchParams({
      status,
      student: student.nick,
    });

    navigate(`/penalties?${params.toString()}`);
  };

  const rowClass = student.overdue_penalties > 0 ? 'overdue' : student.in_workoff ? 'in-workoff' : '';
  const latestPenalties = [...(student.penalties || [])]
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const toggleMenu = () => {
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }

    const rect = menuButtonRef.current?.getBoundingClientRect();
    if (rect) {
      setMenuPosition({
        top: rect.bottom + 6,
        left: Math.max(12, rect.right - 196),
      });
    }
    setMenuOpen(true);
  };

  const togglePenalties = () => {
    if (penaltiesOpen) {
      setPenaltiesOpen(false);
      return;
    }

    const rect = penaltiesButtonRef.current?.getBoundingClientRect();
    if (rect) {
      const width = 340;
      setPenaltiesPosition({
        top: rect.bottom + 8,
        left: Math.max(12, rect.left + (rect.width / 2) - (width / 2)),
      });
    }
    setPenaltiesOpen(true);
  };

  return (
    <tr className={rowClass}>
      <td data-label="Ученик">
        <div className="student-person">
          <button type="button" className="nick-button" onClick={handleCopyNick} title="Скопировать ник">
            <strong>{copied ? 'Скопировано' : student.nick}</strong>
          </button>
        </div>
      </td>
      <td data-label="Трайб">
        {student.tribe ? <span className="tribe-badge"><TribeLabel tribe={student.tribe} size={16} /></span> : <span className="text-muted">—</span>}
      </td>
      <td data-label="Мероприятия">
        <div className="student-events">
          <strong>{student.events_total || 0}</strong>
          <div className="student-events-inline">
            <span className="event-pill">🎉 {student.entertainment_events || 0}</span>
            <span className="event-pill">📚 {student.education_events || 0}</span>
          </div>
        </div>
      </td>
      <td data-label="Статус">
        {PENALTY_ROUTE_STATUS[student.penalty_status] ? (
          <button
            type="button"
            className={`workoff-pill workoff-pill-button ${student.penalty_status || 'clean'}`}
            onClick={handleOpenPenaltyStatus}
            title="Открыть штрафы ученика"
          >
            {PENALTY_STATUS_LABELS[student.penalty_status || 'clean'] || 'Все ок'}
          </button>
        ) : (
          <span className={`workoff-pill ${student.penalty_status || 'clean'}`}>
            {PENALTY_STATUS_LABELS[student.penalty_status || 'clean'] || 'Все ок'}
          </span>
        )}
      </td>
      <td data-label="Штрафы">
        <div className="student-penalties-cell">
          {student.penalties?.length > 0 ? (
            <div className="penalties-disclosure">
              <button
                type="button"
                className="penalties-trigger"
                onClick={togglePenalties}
                ref={penaltiesButtonRef}
              >
                <span className="penalties-count">{student.penalties.length}</span>
                <span className="penalties-summary-label">Показать</span>
              </button>
              {penaltiesOpen && (
                <div
                  className="penalties-popover penalties-list compact"
                  ref={penaltiesRef}
                  style={{ top: `${penaltiesPosition.top}px`, left: `${penaltiesPosition.left}px` }}
                >
                  {latestPenalties.map((penalty, idx) => (
                    <div key={idx} className="penalty-item">
                      <span className={`status ${penalty.status}`}>{PENALTY_ITEM_LABELS[penalty.status] || penalty.status}</span>
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
          ) : (
            <span className="text-muted">—</span>
          )}
        </div>
      </td>
      <td data-label="Управление">
        <div className="student-actions">
          {canManage ? (
            <div className="student-menu">
              <button
                type="button"
                className="btn-icon"
                onClick={toggleMenu}
                ref={menuButtonRef}
                title="Управление"
              >
                <MoreHorizontal size={18} />
              </button>
              {menuOpen && (
                <div
                  className="student-menu-dropdown"
                  ref={menuRef}
                  style={{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }}
                >
                  <button type="button" className="student-menu-item danger" onClick={handleDelete}>
                    <Trash2 size={16} /> Удалить
                  </button>
                  <div className="student-menu-divider" />
                  <div className="student-menu-group">
                    <span className="student-menu-label">Поменять трайб</span>
                    <select
                      className="student-menu-select"
                      value={student.tribe || ''}
                      onChange={(e) => handleChangeTribe(e.target.value)}
                    >
                      <option value="">Без трайба</option>
                      {tribes.map((tribe) => (
                        <option value={tribe} key={tribe}>{tribe}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <span className="text-muted">—</span>
          )}
        </div>
      </td>
    </tr>
  );
}

function StudentForm({ tribes, onClose, onSuccess }) {
  const [form, setForm] = useState({
    nick: '',
    tribe: tribes[0] || ''
  });

  useEffect(() => {
    setForm((current) => ({ ...current, tribe: current.tribe || tribes[0] || '' }));
  }, [tribes]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.nick.trim()) {
      alert('Укажите ник');
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
          <label>Ник школьный</label>
          <input
            type="text"
            placeholder="example_nick"
            value={form.nick}
            onChange={(e) => setForm({ ...form, nick: e.target.value })}
            autoFocus
          />
        </div>

        <div className="form-group">
          <label>Трайб</label>
          <select
            value={form.tribe}
            onChange={(e) => setForm({ ...form, tribe: e.target.value })}
          >
            <option value="">Без трайба</option>
            {tribes.map((tribe) => (
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
