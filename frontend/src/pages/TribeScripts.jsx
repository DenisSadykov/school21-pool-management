import React, { useMemo, useState } from 'react';
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Edit3,
  RotateCcw,
  Search,
} from 'lucide-react';
import { api } from '../api';
import Loader from '../components/Loader';
import { moscowTodayIso } from '../utils/date';
import '../styles/Pages.css';
import '../styles/TribeScripts.css';

const CATEGORY_LABELS = {
  start: 'Старт',
  meetings: 'Встречи',
  activities: 'Мероприятия',
  studies: 'Учёба',
  rules: 'Правила',
  exam: 'Экзамен',
  motivation: 'Мотивация',
  community: 'Комьюнити',
};

function formatDate(value) {
  if (!value) return 'дата не задана';
  return new Date(`${value}T00:00:00`).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
  });
}

function formatSentAt(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function matchesSearch(template, query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  const variableLabels = (template.variables || []).map((variable) => variable.label).join(' ');
  return `${template.title} ${template.text} ${template.note} ${variableLabels}`.toLowerCase().includes(normalized);
}

function compareTemplateDates(left, right) {
  return (left.recommended_date || '9999-12-31').localeCompare(right.recommended_date || '9999-12-31');
}

function variableValue(variable, values) {
  const entered = values?.[variable.key];
  return entered === undefined ? (variable.default || '') : entered;
}

function unresolvedVariables(template, values) {
  return (template.variables || []).filter((variable) => !variableValue(variable, values).trim());
}

function resolveTemplateText(template, sourceText, values) {
  const variables = Object.fromEntries((template.variables || []).map((variable) => [variable.key, variable]));
  return sourceText.replace(/\{\{([a-z0-9_]+)\}\}/g, (match, key) => {
    const variable = variables[key];
    if (!variable) return match;
    return variableValue(variable, values) || `[${variable.label}]`;
  });
}

function TribeScripts() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [kind, setKind] = useState('all');
  const [todayOnly, setTodayOnly] = useState(() => (
    new URLSearchParams(window.location.search).get('today') === '1'
  ));
  const [expanded, setExpanded] = useState({});
  const [drafts, setDrafts] = useState({});
  const [variableValues, setVariableValues] = useState({});
  const [editingId, setEditingId] = useState('');
  const [copiedId, setCopiedId] = useState('');
  const [savingId, setSavingId] = useState('');

  React.useEffect(() => {
    let alive = true;
    api.get('/api/tribe-scripts')
      .then((payload) => {
        if (alive) setData(payload);
      })
      .catch((requestError) => {
        if (alive) setError(requestError.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const categories = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.templates.map((template) => template.category))];
  }, [data]);

  const visibleTemplates = useMemo(() => {
    if (!data) return [];
    const today = moscowTodayIso();
    return [...data.templates]
      .filter((template) => (
        matchesSearch(template, query)
        && (category === 'all' || template.category === category)
        && (kind === 'all' || template.kind === kind)
        && (!todayOnly || template.recommended_date === today)
      ))
      .sort(compareTemplateDates);
  }, [data, query, category, kind, todayOnly]);

  const activeTemplates = visibleTemplates.filter((template) => !template.sent);
  const sentTemplates = visibleTemplates.filter((template) => template.sent);

  const updateLocalTemplate = (templateId, changes) => {
    setData((current) => {
      const templates = current.templates.map((template) => (
        template.id === templateId ? { ...template, ...changes } : template
      ));
      const sent = templates.filter((template) => template.sent).length;
      return {
        ...current,
        templates,
        summary: { total: templates.length, sent, remaining: templates.length - sent },
      };
    });
  };

  const setSent = async (template, sent) => {
    setSavingId(template.id);
    try {
      const payload = await api.patch(`/api/tribe-scripts/${encodeURIComponent(template.id)}`, { sent });
      updateLocalTemplate(template.id, { sent: payload.sent, sent_at: payload.sent_at });
    } catch (requestError) {
      alert('Не удалось сохранить отметку: ' + requestError.message);
    } finally {
      setSavingId('');
    }
  };

  const copyTemplate = async (template) => {
    const values = variableValues[template.id] || {};
    const missing = unresolvedVariables(template, values);
    if (missing.length > 0) {
      setExpanded((current) => ({ ...current, [template.id]: true }));
      alert(`Сначала заполните: ${missing.map((variable) => variable.label).join(', ')}`);
      return;
    }
    const text = resolveTemplateText(template, drafts[template.id] ?? template.text, values);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(template.id);
      window.setTimeout(() => setCopiedId((current) => (current === template.id ? '' : current)), 1800);
    } catch (clipboardError) {
      alert('Не удалось скопировать текст. Выделите его вручную.');
    }
  };

  const resetFilters = () => {
    setQuery('');
    setCategory('all');
    setKind('all');
    setTodayOnly(false);
  };

  if (loading) return <Loader text="Загружаем скрипты..." />;
  if (error) {
    return (
      <div className="page tribe-scripts-page">
        <div className="page-error">Ошибка загрузки: {error}</div>
      </div>
    );
  }

  const hasFilters = query || category !== 'all' || kind !== 'all' || todayOnly;

  return (
    <div className="page tribe-scripts-page">
      <header className="page-header tribe-scripts-header">
        <div>
          <h1>Скрипты трайба</h1>
          <p>Готовые сообщения для Rocket.Chat с разметкой и полями для подстановки.</p>
        </div>
      </header>

      <section className="script-progress" aria-label="Прогресс отправки сообщений">
        <div className="script-progress-copy">
          <span>Отправлено</span>
          <strong>{data.summary.sent} из {data.summary.total}</strong>
        </div>
        <div className="script-progress-track" aria-hidden="true">
          <span style={{ width: `${data.summary.total ? (data.summary.sent / data.summary.total) * 100 : 0}%` }} />
        </div>
        <span className="script-progress-remaining">Осталось: {data.summary.remaining}</span>
      </section>

      <section className="script-toolbar" aria-label="Фильтры шаблонов">
        <label className="script-search">
          <Search size={16} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Найти сообщение"
            aria-label="Найти сообщение"
          />
        </label>
        <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Этап бассейна">
          <option value="all">Все этапы</option>
          {categories.map((value) => <option key={value} value={value}>{CATEGORY_LABELS[value]}</option>)}
        </select>
        <select value={kind} onChange={(event) => setKind(event.target.value)} aria-label="Тип сообщения">
          <option value="all">Все типы</option>
          <option value="standard">Стандартные</option>
          <option value="special">Особые</option>
        </select>
        <label className="script-today-filter">
          <input type="checkbox" checked={todayOnly} onChange={(event) => setTodayOnly(event.target.checked)} />
          На сегодня
        </label>
        {hasFilters && (
          <button type="button" className="script-reset" onClick={resetFilters}>
            <RotateCcw size={15} /> Сбросить
          </button>
        )}
      </section>

      <section className="script-section">
        <div className="script-section-heading">
          <div>
            <h2>К отправке</h2>
            <p>Проверь время, место и детали перед копированием.</p>
          </div>
          <span>{activeTemplates.length}</span>
        </div>
        {activeTemplates.length > 0 ? (
          <div className="script-list">
            {activeTemplates.map((template) => (
              <ScriptRow
                key={template.id}
                template={template}
                expanded={Boolean(expanded[template.id])}
                editing={editingId === template.id}
                draft={drafts[template.id] ?? template.text}
                variableValues={variableValues[template.id] || {}}
                copied={copiedId === template.id}
                saving={savingId === template.id}
                onToggle={() => setExpanded((current) => ({ ...current, [template.id]: !current[template.id] }))}
                onEdit={() => {
                  setExpanded((current) => ({ ...current, [template.id]: true }));
                  setEditingId((current) => (current === template.id ? '' : template.id));
                }}
                onDraftChange={(value) => setDrafts((current) => ({ ...current, [template.id]: value }))}
                onDraftReset={() => setDrafts((current) => {
                  const next = { ...current };
                  delete next[template.id];
                  return next;
                })}
                onVariableChange={(key, value) => setVariableValues((current) => ({
                  ...current,
                  [template.id]: { ...(current[template.id] || {}), [key]: value },
                }))}
                onCopy={() => copyTemplate(template)}
                onSetSent={() => setSent(template, true)}
              />
            ))}
          </div>
        ) : (
          <div className="script-empty">
            <CheckCircle2 size={22} />
            <strong>{hasFilters ? 'По фильтрам ничего не найдено' : 'Все сообщения отправлены'}</strong>
            <span>{hasFilters ? 'Измени или сбрось фильтры.' : 'Отправленные шаблоны находятся в архиве ниже.'}</span>
          </div>
        )}
      </section>

      {sentTemplates.length > 0 && (
        <details className="sent-scripts-archive">
          <summary>
            <span><CheckCircle2 size={18} /> Отправленные</span>
            <span>{sentTemplates.length}<ChevronDown size={17} /></span>
          </summary>
          <div className="script-list sent-script-list">
            {sentTemplates.map((template) => (
              <ScriptRow
                key={template.id}
                template={template}
                expanded={Boolean(expanded[template.id])}
                editing={editingId === template.id}
                draft={drafts[template.id] ?? template.text}
                variableValues={variableValues[template.id] || {}}
                copied={copiedId === template.id}
                saving={savingId === template.id}
                onToggle={() => setExpanded((current) => ({ ...current, [template.id]: !current[template.id] }))}
                onEdit={() => {
                  setExpanded((current) => ({ ...current, [template.id]: true }));
                  setEditingId((current) => (current === template.id ? '' : template.id));
                }}
                onDraftChange={(value) => setDrafts((current) => ({ ...current, [template.id]: value }))}
                onDraftReset={() => setDrafts((current) => {
                  const next = { ...current };
                  delete next[template.id];
                  return next;
                })}
                onVariableChange={(key, value) => setVariableValues((current) => ({
                  ...current,
                  [template.id]: { ...(current[template.id] || {}), [key]: value },
                }))}
                onCopy={() => copyTemplate(template)}
                onSetSent={() => setSent(template, false)}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function ScriptRow({
  template,
  expanded,
  editing,
  draft,
  variableValues,
  copied,
  saving,
  onToggle,
  onEdit,
  onDraftChange,
  onDraftReset,
  onVariableChange,
  onCopy,
  onSetSent,
}) {
  const today = moscowTodayIso();
  const dateTone = template.recommended_date === today
    ? 'today'
    : (template.recommended_date && template.recommended_date < today ? 'past' : 'future');
  const missingVariables = unresolvedVariables(template, variableValues);
  const resolvedText = resolveTemplateText(template, draft, variableValues);

  return (
    <article className={`script-row ${template.sent ? 'is-sent' : ''}`}>
      <div className="script-row-main">
        <div className="script-row-title">
          <button
            type="button"
            className="script-expand"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Скрыть' : 'Показать'} текст: ${template.title}`}
          >
            <ChevronDown size={18} />
          </button>
          <div>
            <div className="script-badges">
              <span className={`script-kind ${template.kind}`}>{template.kind === 'standard' ? 'Стандартный' : 'Особый'}</span>
              <span>{CATEGORY_LABELS[template.category]}</span>
            </div>
            <h3>{template.title}</h3>
            <div className="script-meta">
              <span className={`script-date ${dateTone}`}>
                <CalendarDays size={14} /> {dateTone === 'today' ? 'Сегодня · ' : ''}{formatDate(template.recommended_date)}
              </span>
              {template.sent_at && <span>отмечено {formatSentAt(template.sent_at)}</span>}
              {(template.variables || []).length > 0 && (
                <span className={missingVariables.length ? 'script-fields-missing' : 'script-fields-ready'}>
                  {missingVariables.length ? `Заполнить полей: ${missingVariables.length}` : 'Поля заполнены'}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="script-actions">
          <button type="button" className="btn-secondary script-edit-button" onClick={onEdit}>
            <Edit3 size={15} /> {editing ? 'Готово' : 'Изменить'}
          </button>
          <button type="button" className="btn-primary script-copy-button" onClick={onCopy}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Скопировано' : 'Копировать'}
          </button>
          <button
            type="button"
            className={`script-status-button ${template.sent ? 'restore' : ''}`}
            onClick={onSetSent}
            disabled={saving}
          >
            <CheckCircle2 size={16} />
            {saving ? 'Сохраняем...' : (template.sent ? 'Вернуть к отправке' : 'Отметить отправленным')}
          </button>
        </div>
      </div>

      {template.note && <p className="script-note">{template.note}</p>}

      {expanded && (
        <div className="script-content">
          {(template.variables || []).length > 0 && (
            <div className="script-variable-panel">
              <div className="script-variable-heading">
                <strong>Поля шаблона</strong>
                <span>Подставятся в текст автоматически</span>
              </div>
              <div className="script-variable-grid">
                {template.variables.map((variable) => (
                  <label key={variable.key}>
                    {variable.label}
                    <input
                      value={variableValue(variable, variableValues)}
                      onChange={(event) => onVariableChange(variable.key, event.target.value)}
                      placeholder={variable.placeholder}
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
          {editing ? (
            <>
              <textarea value={draft} onChange={(event) => onDraftChange(event.target.value)} aria-label={`Текст: ${template.title}`} />
              <div className="script-edit-hint">
                <span>Изменения используются при копировании и не меняют исходный шаблон.</span>
                {draft !== template.text && <button type="button" onClick={onDraftReset}><RotateCcw size={14} /> Сбросить текст</button>}
              </div>
            </>
          ) : (
            <pre>{resolvedText}</pre>
          )}
        </div>
      )}
    </article>
  );
}

export default TribeScripts;
