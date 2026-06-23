import React, { useMemo, useState, useEffect } from 'react';
import { Download, FileUp, Plus } from 'lucide-react';
import { api } from '../api';
import '../styles/Pages.css';
import '../styles/Volunteers.css';

const ROLE_LABELS = {
  volunteer: 'Волонтёр',
  tribe_master: 'Трайб-мастер',
  team_lead: 'Тимлид',
};

const FILTERS = [
  { value: 'all', label: 'Все' },
  { value: 'team_lead', label: 'Тимлиды' },
  { value: 'tribe_master', label: 'Трайб-мастера' },
  { value: 'volunteer', label: 'Волонтёры' },
  { value: 'group_review', label: 'Групповые' },
];

const GROUPS = [
  { key: 'team_lead', title: 'Тимлиды', match: (v) => v.role === 'team_lead' },
  { key: 'tribe_master', title: 'Трайб-мастера', match: (v) => v.role === 'tribe_master' },
  { key: 'volunteer', title: 'Волонтёры', match: (v) => v.role === 'volunteer' },
];

const TRIBES = ['Ленты', 'Короны', 'Олени'];

const HEADER_MAP = {
  nick: 'nick',
  ник: 'nick',
  login: 'nick',
  логин: 'nick',
  name: 'name',
  имя: 'name',
  фио: 'name',
  role: 'role',
  статус: 'role',
  роль: 'role',
  tribe: 'tribe',
  триб: 'tribe',
  группа: 'tribe',
};

function normalizeRole(value) {
  const role = String(value || '').trim().toLowerCase();
  if (['tribe_master', 'tribe', 'tm', 'трайб-мастер', 'трайбмастер', 'трайб', 'тм'].includes(role)) {
    return 'tribe_master';
  }
  return 'volunteer';
}

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

function parseVolunteersFile(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const delimiter = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';
  const first = splitCsvLine(lines[0], delimiter).map((cell) => HEADER_MAP[cell.toLowerCase()] || null);
  const hasHeader = first.includes('nick') || first.includes('name') || first.includes('role');
  const columns = hasHeader ? first : ['nick', 'name', 'role', 'tribe'];
  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines
    .map((line) => {
      const cells = splitCsvLine(line, delimiter);
      const volunteer = cells.reduce((acc, cell, index) => {
        const key = columns[index];
        if (key) acc[key] = cell;
        return acc;
      }, {});
      return {
        nick: volunteer.nick || '',
        name: volunteer.name || volunteer.nick || '',
        role: normalizeRole(volunteer.role),
        tribe: volunteer.tribe || '',
      };
    })
    .filter((volunteer) => volunteer.nick);
}

function Volunteers({ user }) {
  const [volunteers, setVolunteers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const isStaff = user?.role === 'team_lead' || user?.role === 'admin';

  const load = () => {
    setLoading(true);
    api.get('/api/volunteers')
      .then(setVolunteers)
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const updateVolunteer = async (id, patch) => {
    try {
      await api.patch(`/api/volunteers/${id}`, patch);
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return volunteers.filter((volunteer) => {
      const matchesQuery = !normalized
        || volunteer.nick.toLowerCase().includes(normalized)
        || volunteer.name.toLowerCase().includes(normalized);
      const matchesFilter = filter === 'all'
        || volunteer.role === filter
        || (filter === 'group_review' && volunteer.is_group_reviewer);
      return matchesQuery && matchesFilter;
    });
  }, [volunteers, filter, query]);

  const occupiedTribes = useMemo(
    () => volunteers
      .filter((volunteer) => volunteer.role === 'tribe_master' && volunteer.tribe)
      .map((volunteer) => volunteer.tribe),
    [volunteers],
  );

  if (loading) return <div className="loading">Загрузка волонтёров...</div>;

  return (
    <div className="page volunteers-page">
      <div className="page-header volunteers-header">
        <h1>Волонтёры</h1>
        <div className="volunteer-filters">
          {isStaff && (
            <>
              <button className="btn-secondary" type="button" onClick={() => setShowImport(!showImport)}>
                <FileUp size={18} /> Загрузить список
              </button>
              <button className="btn-primary" type="button" onClick={() => setShowAdd(!showAdd)}>
                <Plus size={18} /> Добавить
              </button>
            </>
          )}
          <input
            type="search"
            placeholder="Ник или имя"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            {FILTERS.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </div>
      </div>

      {showAdd && (
        <VolunteerForm
          occupiedTribes={occupiedTribes}
          onClose={() => setShowAdd(false)}
          onSuccess={() => {
            setShowAdd(false);
            load();
          }}
        />
      )}

      {showImport && (
        <VolunteersImport
          onClose={() => setShowImport(false)}
          onSuccess={load}
        />
      )}

      <div className="volunteer-summary">
        <Summary label="Всего" value={filtered.length} />
        <Summary label="Трайб-мастеров" value={filtered.filter((v) => v.role === 'tribe_master').length} />
        <Summary label="Групповых проверяющих" value={filtered.filter((v) => v.is_group_reviewer).length} />
        <Summary label="Всего коинов" value={filtered.reduce((sum, v) => sum + (v.coins || 0), 0)} />
      </div>

      {filtered.length === 0 && (
        <div className="empty-state">Никого не нашли по этим фильтрам.</div>
      )}

      {GROUPS.map((group) => {
        const rows = filtered.filter(group.match);
        if (rows.length === 0) return null;
        return (
          <section key={group.key} className="volunteer-group">
            <button className="group-title" type="button">
              <span>{group.title}</span>
              <strong>{rows.length}</strong>
            </button>
            <div className="volunteer-table-wrap">
              <table className="volunteer-table">
                <thead>
                  <tr>
                    <th>Человек</th>
                    <th>Статусы</th>
                    <th>Смены</th>
                    <th>Коины</th>
                    <th>За что</th>
                    {isStaff && <th>Управление</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((volunteer) => (
                    <VolunteerRow
                      key={volunteer.id}
                      volunteer={volunteer}
                      occupiedTribes={occupiedTribes}
                      isStaff={isStaff}
                      onUpdate={updateVolunteer}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function VolunteerForm({ occupiedTribes, onClose, onSuccess }) {
  const [form, setForm] = useState({
    nick: '',
    name: '',
    role: 'volunteer',
    tribe: '',
  });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.nick.trim()) {
      alert('Укажите ник');
      return;
    }
    try {
      await api.post('/api/volunteers', form);
      onSuccess();
    } catch (error) {
      alert('❌ Ошибка: ' + error.message);
    }
  };

  return (
    <form className="volunteer-panel" onSubmit={submit}>
      <h2>Добавить волонтёра</h2>
      <div className="volunteer-form-grid">
        <label>
          Ник
          <input value={form.nick} onChange={(e) => setForm({ ...form, nick: e.target.value })} autoCapitalize="none" />
        </label>
        <label>
          Имя
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label>
          Статус
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="volunteer">Волонтёр</option>
            <option value="tribe_master">Трайб-мастер</option>
          </select>
        </label>
        <label>
          Трайб
          <select value={form.tribe} onChange={(e) => setForm({ ...form, tribe: e.target.value })}>
            <option value="">Не задан</option>
            {TRIBES.filter((tribe) => form.role !== 'tribe_master' || !occupiedTribes.includes(tribe)).map((tribe) => (
              <option value={tribe} key={tribe}>{tribe}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="panel-actions">
        <button type="submit" className="btn-primary">Добавить</button>
        <button type="button" className="btn-secondary" onClick={onClose}>Отмена</button>
      </div>
    </form>
  );
}

function VolunteersImport({ onClose, onSuccess }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [volunteers, setVolunteers] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    setResult(null);
    setVolunteers([]);
    setSelectedFile(file || null);
    if (!file) return;
    setFileName(file.name);
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setVolunteers(parseVolunteersFile(await file.text()));
    }
  };

  const submit = async () => {
    if (!selectedFile) {
      alert('Выберите файл');
      return;
    }
    const isXlsx = selectedFile.name.toLowerCase().endsWith('.xlsx');
    if (!isXlsx && volunteers.length === 0) {
      alert('В файле не нашлось волонтёров');
      return;
    }
    setLoading(true);
    try {
      let res;
      if (isXlsx) {
        const formData = new FormData();
        formData.append('file', selectedFile);
        res = await api.upload('/api/volunteers/import-file', formData);
      } else {
        res = await api.post('/api/volunteers/import', { volunteers });
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
    <section className="volunteer-panel">
      <h2>Загрузить волонтёров списком</h2>
      <div className="import-grid">
        <label>
          XLSX, CSV или TXT
          <input type="file" accept=".xlsx,.csv,.txt,text/csv,text/plain" onChange={handleFile} />
        </label>
        <div className="import-help">
          Лучше скачать XLSX-шаблон: там уже есть столбцы и выпадающие списки. CSV/TXT тоже поддерживаются.
        </div>
      </div>
      <a
        className="btn-secondary template-button"
        href="/templates/volunteers-template.xlsx"
        download="volunteers-template.xlsx"
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
            <strong>Найдено: {volunteers.length}</strong>
          </div>
          {volunteers.slice(0, 6).map((volunteer, index) => (
            <div className="import-row" key={`${volunteer.nick}-${index}`}>
              <span>@{volunteer.nick}</span>
              <span>{volunteer.name}</span>
              <span>{ROLE_LABELS[volunteer.role]}</span>
              <span>{volunteer.tribe || '—'}</span>
            </div>
          ))}
          {volunteers.length > 6 && <p className="text-muted">И ещё {volunteers.length - 6} строк...</p>}
        </div>
      )}
      {result && <div className="alert success">{result.message}</div>}
      <div className="panel-actions">
        <button type="button" className="btn-primary" onClick={submit} disabled={loading || !selectedFile}>
          {loading ? 'Загружаю...' : 'Импортировать'}
        </button>
        <button type="button" className="btn-secondary" onClick={onClose}>Закрыть</button>
      </div>
    </section>
  );
}

function Summary({ label, value }) {
  return (
    <div className="summary-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function VolunteerRow({ volunteer, occupiedTribes, isStaff, onUpdate }) {
  const [coinsAdjustment, setCoinsAdjustment] = useState(volunteer.coins_adjustment || 0);
  const canChangeRole = isStaff && volunteer.role !== 'team_lead';

  useEffect(() => {
    setCoinsAdjustment(volunteer.coins_adjustment || 0);
  }, [volunteer.coins_adjustment]);

  return (
    <tr>
      <td>
        <div className="person-cell">
          <strong>@{volunteer.nick}</strong>
          <span>{volunteer.name}</span>
        </div>
      </td>
      <td>
        <div className="status-list">
          <span className={`status-pill role-${volunteer.role}`}>{ROLE_LABELS[volunteer.role] || volunteer.role}</span>
          {volunteer.is_group_reviewer && (
            <span className="status-pill group">
              Групповой проверяющий{volunteer.group_reviews_count ? ` · ${volunteer.group_reviews_count}` : ''}
            </span>
          )}
          {volunteer.has_confession && <span className="status-pill confession">Исповедь</span>}
        </div>
      </td>
      <td>{volunteer.shifts_count}</td>
      <td>
        <strong className="coins-value">{volunteer.coins}</strong>
      </td>
      <td>
        <div className="coin-breakdown">
          {(volunteer.coin_breakdown || []).filter((item) => item.coins !== 0 || item.count > 0).map((item) => (
            <span key={item.type}>{item.label}: {item.coins}</span>
          ))}
        </div>
      </td>
      {isStaff && (
        <td>
          <div className="volunteer-actions">
            {canChangeRole && (
              <select
                value={volunteer.role}
                onChange={(e) => onUpdate(volunteer.id, { role: e.target.value })}
              >
                <option value="volunteer">Волонтёр</option>
                <option value="tribe_master">Трайб-мастер</option>
              </select>
            )}
            {volunteer.role === 'tribe_master' && (
              <select
                value={volunteer.tribe || ''}
                onChange={(e) => onUpdate(volunteer.id, { tribe: e.target.value })}
              >
                <option value="">Трайб не задан</option>
                {TRIBES.filter((tribe) => tribe === volunteer.tribe || !occupiedTribes.includes(tribe)).map((tribe) => (
                  <option value={tribe} key={tribe}>{tribe}</option>
                ))}
              </select>
            )}
            <label className="check-control">
              <input
                type="checkbox"
                checked={volunteer.has_confession}
                onChange={(e) => onUpdate(volunteer.id, { has_confession: e.target.checked })}
              />
              Исповедь
            </label>
            {isStaff && (
              <div className="coin-editor">
                <input
                  type="number"
                  value={coinsAdjustment}
                  onChange={(e) => setCoinsAdjustment(e.target.value)}
                  aria-label="Корректировка коинов"
                />
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => onUpdate(volunteer.id, { coins_adjustment: coinsAdjustment })}
                >
                  OK
                </button>
              </div>
            )}
          </div>
        </td>
      )}
    </tr>
  );
}

export default Volunteers;
