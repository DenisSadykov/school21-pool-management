import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Lock, Plus, Pencil, Trash2, Search, X } from 'lucide-react';
import { api } from '../api';
import Loader from '../components/Loader';
import '../styles/Pages.css';
import '../styles/MyNotes.css';

function noteDate(value) {
  return new Date(value).toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function NoteEditor({ note, students = [], selectedStudent, onSaved, onCancel }) {
  const [text, setText] = useState(note?.text || '');
  const [studentId, setStudentId] = useState(String(selectedStudent || ''));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault();
    if (saving || !text.trim() || (!note && !studentId)) return;
    setSaving(true);
    setError('');
    try {
      const saved = note
        ? await api.patch(`/api/me/student-notes/${note.id}`, { text, updated_at: note.updated_at })
        : await api.post('/api/me/student-notes', { text, student_id: Number(studentId) });
      onSaved(saved);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <form className="my-notes-editor" onSubmit={submit}>
      <h2>{note ? `Редактирование заметки о @${note.student_nick}` : 'Новая заметка'}</h2>
      {!note && <label>Пир
        <select value={studentId} onChange={e => setStudentId(e.target.value)} required disabled={saving}>
          <option value="">Выберите пира</option>
          {students.map(student => <option key={student.id} value={student.id}>@{student.nick}</option>)}
        </select>
      </label>}
      <label>Текст заметки
        <textarea value={text} onChange={e => setText(e.target.value)} maxLength={4000}
          rows={5} required disabled={saving} placeholder="Запишите своё наблюдение об ученике…" />
      </label>
      <div className="my-notes-editor-footer">
        <small>{text.length} / 4000 · Видно только вам</small>
        <div className="my-notes-actions">
          <button className="btn-secondary" type="button" onClick={onCancel} disabled={saving}>Отмена</button>
          <button className="btn-primary" type="submit" disabled={saving || !text.trim() || (!note && !studentId)}>
            {saving ? 'Сохраняю…' : 'Сохранить'}
          </button>
        </div>
      </div>
      {error && <p className="my-notes-error" role="alert">{error}</p>}
    </form>
  );
}

function NoteEntry({ note, onChanged, onDeleted }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const remove = async () => {
    if (deleting) return;
    setDeleting(true);
    setError('');
    try {
      await api.del(`/api/me/student-notes/${note.id}`);
      onDeleted(note.id);
    } catch (requestError) {
      setError(requestError.message);
      setDeleting(false);
    }
  };
  return (
    <article className="my-note-entry">
      {editing ? <NoteEditor note={note} onCancel={() => setEditing(false)} onSaved={saved => {
        onChanged(saved); setEditing(false);
      }} /> : <>
        <div className="my-note-heading">
          <div><h2>@{note.student_nick}</h2>
            <time dateTime={note.created_at}>{noteDate(note.created_at)}</time>
            {note.updated_at !== note.created_at && <span className="my-note-edited"> · Изменено {noteDate(note.updated_at)}</span>}
          </div>
          <div className="my-notes-actions">
            <button type="button" className="my-note-icon" aria-label={`Редактировать заметку о @${note.student_nick}`}
              onClick={() => setEditing(true)} disabled={deleting}><Pencil size={18} /></button>
            <button type="button" className="my-note-icon" aria-label={`Удалить заметку о @${note.student_nick}`}
              onClick={() => setConfirming(true)} disabled={deleting}><Trash2 size={18} /></button>
          </div>
        </div>
        <p className="my-note-text">{note.text}</p>
        {!note.student_id && <small className="my-note-edited">Пир больше не находится в списке. Ваша заметка сохранена.</small>}
        {confirming && <div className="my-note-delete-confirm">
          <p>Удалить эту заметку? Восстановить её в кабинете нельзя.</p>
          <div className="my-notes-actions">
            <button className="btn-secondary" type="button" disabled={deleting} onClick={() => setConfirming(false)}>Оставить</button>
            <button className="btn-secondary my-note-danger" type="button" disabled={deleting} onClick={remove}>
              {deleting ? 'Удаляю…' : 'Да, удалить'}
            </button>
          </div>
        </div>}
        {error && <p className="my-notes-error" role="alert">{error}</p>}
      </>}
    </article>
  );
}

export default function MyNotes() {
  const [params, setParams] = useSearchParams();
  const studentId = params.get('student_id') || '';
  const [notes, setNotes] = useState([]);
  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [studentsError, setStudentsError] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(Boolean(studentId));
  const [version, setVersion] = useState(0);
  const [message, setMessage] = useState('');
  const requestId = useRef(0);

  useEffect(() => {
    let alive = true;
    api.get('/api/students').then(data => { if (alive) setStudents(data); })
      .catch(e => { if (alive) setStudentsError(e.message); })
      .finally(() => { if (alive) setStudentsLoading(false); });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError('');
    const search = new URLSearchParams({ q: query.trim(), sort, page: String(page) });
    if (studentId) search.set('student_id', studentId);
    api.get(`/api/me/student-notes?${search}`).then(data => {
      if (requestId.current !== id) return;
      setNotes(data.notes); setTotal(data.total); setHasMore(data.has_more);
    }).catch(e => { if (requestId.current === id) setError(e.message); })
      .finally(() => { if (requestId.current === id) setLoading(false); });
    return () => { requestId.current += 1; };
  }, [query, sort, page, studentId, version]);
  const reload = () => { setPage(1); setVersion(v => v + 1); };
  const selected = students.find(student => String(student.id) === studentId);

  return (
    <div className="page my-notes-page">
      <div className="page-header">
        <div><h1>Мои заметки</h1><p className="my-notes-private"><Lock size={16} /> Только ваши записи. Другие пользователи их не видят.</p></div>
        <button className="btn-primary" type="button" onClick={() => { setCreating(true); setMessage(''); }} disabled={creating}>
          <Plus size={18} /> Добавить заметку
        </button>
      </div>
      {studentId && <div className="my-notes-student-scope">
        <span>{selected ? `Заметки о @${selected.nick}` : 'Заметки выбранного пира'}</span>
        <button className="btn-secondary" type="button" onClick={() => { setParams({}); setPage(1); setCreating(false); }}><X size={16} /> Все мои заметки</button>
      </div>}
      {message && <p className="my-notes-success" role="status">{message}</p>}
      {creating && <>
        {studentsLoading ? <Loader text="Загрузка пиров…" compact /> : studentsError ? <p className="my-notes-error" role="alert">Не удалось загрузить пиров: {studentsError}. <Link to="/students">Открыть пиров</Link></p>
          : <NoteEditor key={studentId || 'new'} students={students} selectedStudent={selected?.id}
            onCancel={() => setCreating(false)} onSaved={() => { setCreating(false); setMessage('Заметка сохранена'); reload(); }} />}
      </>}
      <div className="my-notes-toolbar">
        <label className="my-notes-search"><span>Поиск по нику</span><div><Search size={18} />
          <input type="search" placeholder="Ник пира" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} />
        </div></label>
        <label>Порядок записей<select value={sort} onChange={e => { setSort(e.target.value); setPage(1); }}>
          <option value="newest">Сначала новые</option><option value="oldest">Сначала старые</option>
        </select></label>
      </div>
      {loading ? <Loader text="Загрузка заметок…" compact /> : error ? <div className="my-notes-empty">
        <p role="alert">{error}</p><button className="btn-secondary" type="button" onClick={reload}>Повторить</button>
      </div> : notes.length === 0 ? <div className="my-notes-empty">
        <h2>{query ? 'По этому нику нет заметок' : 'Здесь будут ваши наблюдения о пирах'}</h2>
        <p>{query ? 'Попробуйте другой ник или очистите поиск.' : 'Выберите пира в новой заметке или откройте «Мои заметки» рядом с его ником в разделе «Пиры».'}</p>
      </div> : <>
        <p className="my-notes-count">Записей: {total}</p>
        <div className="my-notes-list">{notes.map(note => <NoteEntry key={note.id} note={note}
          onChanged={saved => { setNotes(current => current.map(item => item.id === saved.id ? saved : item)); setMessage('Изменения сохранены'); }}
          onDeleted={() => { setMessage('Заметка удалена'); reload(); }} />)}</div>
        <div className="my-notes-pagination">
          <button className="btn-secondary" type="button" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Назад</button>
          <span>Страница {page}</span>
          <button className="btn-secondary" type="button" disabled={!hasMore} onClick={() => setPage(p => p + 1)}>Далее</button>
        </div>
      </>}
    </div>
  );
}
