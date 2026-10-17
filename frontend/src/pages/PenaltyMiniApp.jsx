import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Brush, Map, Milestone, Package, Monitor, Users, Clock3, Shuffle, Check, ChevronRight, History, RefreshCw, X, Pencil } from 'lucide-react';
import { initializeMiniApp, operationId } from '../miniapp/client';
import MiniAppNav from '../miniapp/MiniAppNav';
import { playHaptic } from '../miniapp/haptics';
import useTheme from '../hooks/useTheme';
import '../styles/PenaltyMiniApp.css';

const ICONS = { broom: Brush, map: Map, sign: Milestone, box: Package, monitor: Monitor, users: Users };
const TASK_STATES = { active: 'В работе', completed: 'Выполнено', unavailable: 'Не подошло', cancelled: 'Отменено' };
const OPEN = ['pending', 'overdue', 'in_workoff'];

function TaskIcon({ task, size = 23 }) {
  const Icon = ICONS[task?.icon] || Package;
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true" />;
}

export function formatCountdown(seconds) {
  const value = Math.max(0, Math.ceil(seconds));
  return [Math.floor(value / 3600), Math.floor(value / 60) % 60, value % 60]
    .map((part) => String(part).padStart(2, '0')).join(':');
}

export function Roulette({ catalog, selected, spinning, pupilSelected, sdk }) {
  const [rolling, setRolling] = useState(0);
  useEffect(() => {
    if (!spinning || !catalog.length) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    let ticks = 0;
    const started = Date.now();
    const timer = window.setInterval(() => {
      setRolling((value) => value + 1);
      // Gentle, spaced ticks, bounded even while the network is slow.
      if (++ticks % 2 === 0 && Date.now() - started < 1100) playHaptic(sdk, 'selectionChanged');
    }, 85);
    return () => window.clearInterval(timer);
  }, [spinning, catalog.length, sdk]);
  const index = spinning ? rolling % Math.max(1, catalog.length)
    : Math.max(0, catalog.findIndex((item) => item.id === (selected?.task_key || selected?.id)));
  const center = spinning ? catalog[index] : selected;
  const previous = (spinning || selected) && catalog[(index - 1 + catalog.length) % Math.max(1, catalog.length)];
  const next = (spinning || selected) && catalog[(index + 1) % Math.max(1, catalog.length)];
  return (
    <div className={`pm-reel${spinning ? ' pm-reel-spinning' : ''}`} aria-busy={spinning} data-testid="task-reel">
      <div className="pm-reel-row pm-reel-neighbor" aria-hidden="true"><TaskIcon task={previous} /><span>{previous?.title || 'Случайный выбор'}</span></div>
      <div className="pm-reel-row pm-reel-selected" aria-live={spinning ? 'off' : 'polite'} aria-atomic="true">
        <TaskIcon task={center} /><span>{center?.title || (spinning ? 'Крутим рулетку…' : pupilSelected ? 'Нажми «Выбрать»' : 'Сначала выбери ученика')}</span>
      </div>
      <div className="pm-reel-row pm-reel-neighbor" aria-hidden="true"><TaskIcon task={next} /><span>{next?.title || 'Случайное задание'}</span></div>
    </div>
  );
}

export default function PenaltyMiniApp({ renderPlatform }) {
  const [phase, setPhase] = useState('loading');
  const [catalog, setCatalog] = useState([]);
  const [penalties, setPenalties] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState(null);
  const [taskMode, setTaskMode] = useState('random');
  const [customText, setCustomText] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useTheme();
  const [now, setNow] = useState(Date.now());
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [startVersion, setStartVersion] = useState(0);
  const [view, setView] = useState(() => window.location.hash.startsWith('#/') && renderPlatform ? 'platform'
    : new URLSearchParams(window.location.search).get('view') === 'working' ? 'working' : 'issue');
  const [workers, setWorkers] = useState([]);
  const requestRef = useRef(null);
  const sdkRef = useRef(null);
  const alive = useRef(true);
  const selectedRef = useRef('');
  const busyRef = useRef(false);
  const offsetRef = useRef(0);
  const excludedRef = useRef([]);
  const operationRef = useRef(null);
  const customDraftRef = useRef(null);
  const generationRef = useRef(0);
  const mutationVersion = useRef(0);
  const finishTriggerRef = useRef(null);
  selectedRef.current = selectedId;

  const setClock = useCallback((serverNow) => {
    if (!serverNow) return;
    offsetRef.current = Date.parse(serverNow) - Date.now();
    setNow(Date.now() + offsetRef.current);
  }, []);

  const updatePenalty = useCallback((response) => {
    if (!alive.current) return;
    mutationVersion.current += 1;
    setClock(response.server_now);
    const item = response.penalty;
    setPenalties((items) => items.some((existing) => existing.id === item.id)
      ? items.map((existing) => existing.id === item.id ? item : existing) : [...items, item]);
    setWorkers((items) => item.workoff_status === 'in_workoff'
      ? [...items.filter((existing) => existing.id !== item.id), item].sort((a, b) => a.student_name.localeCompare(b.student_name))
      : items.filter((existing) => existing.id !== item.id));
  }, [setClock]);

  useEffect(() => {
    alive.current = true;
    const generation = ++generationRef.current;
    const current = () => alive.current && generationRef.current === generation;
    setPhase('loading');
    setError('');
    setDraft(null); customDraftRef.current = null;
    initializeMiniApp({ isCurrent: current }).then(async ({ request: call, sdk }) => {
      if (!current()) return;
      requestRef.current = call;
      sdkRef.current = sdk;
      if (sdk) {
        sdk.ready?.();
        sdk.expand?.();
      }
      const data = await call();
      if (!current()) return;
      setCatalog(data.catalog);
      setPenalties(data.penalties);
      setWorkers(data.penalties.filter((item) => item.workoff_status === 'in_workoff'));
      setClock(data.server_now);
      const requested = new URLSearchParams(window.location.search).get('penalty');
      const initial = data.penalties.find((item) => String(item.id) === requested);
      setSelectedId(initial ? String(initial.id) : '');
      setPhase('ready');
    }).catch((failure) => {
      if (current()) { setError(failure.message); setPhase('error'); }
    });
    return () => { alive.current = false; };
  }, [startVersion, setClock]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now() + offsetRef.current), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const previous = document.title;
    document.title = 'Выдаватель пенальти · School 21 Pool';
    try {
      const accent = localStorage.getItem('uiAccentScheme');
      if (['cobalt', 'jade', 'amber'].includes(accent)) document.documentElement.setAttribute('data-accent-scheme', accent);
    } catch (_) { /* The shared default palette also works without storage. */ }
    return () => { document.title = previous; };
  }, []);

  const refresh = useCallback(async (id = selectedRef.current) => {
    if (!id || !requestRef.current) return;
    const response = await requestRef.current(`/penalties/${id}`);
    if (alive.current && selectedRef.current === id) updatePenalty(response);
    return response;
  }, [updatePenalty]);

  const refreshWorkers = useCallback(async () => {
    if (!requestRef.current) return;
    const version = mutationVersion.current;
    const response = await requestRef.current('/working');
    if (alive.current && mutationVersion.current === version && !busyRef.current) { setWorkers(response.workers); setClock(response.server_now); }
  }, [setClock]);

  useEffect(() => {
    if (phase !== 'ready') return undefined;
    const poll = () => {
      if (busyRef.current || document.visibilityState === 'hidden') return;
      refreshWorkers().catch((failure) => { if (alive.current) setError(failure.message); });
    };
    const timer = window.setInterval(poll, 7000);
    return () => window.clearInterval(timer);
  }, [phase, refreshWorkers]);

  const openWorker = async (worker) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy('open'); setError('');
    try {
      const response = await requestRef.current(`/penalties/${worker.id}`);
      if (!alive.current) return;
      updatePenalty(response); selectPupil(String(worker.id)); setView('issue');
      window.scrollTo({ top: 0, behavior: 'instant' });
    } catch (failure) { if (alive.current) setError(failure.message); }
    finally { busyRef.current = false; if (alive.current) setBusy(''); }
  };

  useEffect(() => {
    if (phase !== 'ready' || !selectedId) return undefined;
    const poll = () => {
      if (busyRef.current || document.visibilityState === 'hidden') return;
      refresh(selectedId).catch((failure) => { if (alive.current) setError(failure.message); });
    };
    const timer = window.setInterval(poll, 7000);
    window.addEventListener('focus', poll);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', poll); };
  }, [phase, selectedId, refresh]);

  const animate = useCallback(async () => {
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      await new Promise((resolve) => window.setTimeout(resolve, 1050));
    }
  }, []);

  const spin = useCallback(async (id, exclude = []) => {
    if (!id || busyRef.current || !requestRef.current) return;
    busyRef.current = true;
    setBusy('spin'); setError(''); setNotice('');
    try {
      const response = await requestRef.current(`/penalties/${id}/spin`, { exclude_keys: exclude });
      await animate();
      if (!alive.current || selectedRef.current !== id) return;
      setClock(response.server_now);
      setDraft(response);
      excludedRef.current = [...new Set([...exclude, response.task.id])];
      playHaptic(sdkRef.current, 'impactOccurred', 'light');
    } catch (failure) {
      if (alive.current && selectedRef.current === id) setError(failure.message);
      if (failure.status === 409) await refresh(id).catch(() => {});
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy('');
    }
  }, [refresh, setClock, animate]);

  const selectPupil = (id) => {
    // Selection only changes the pupil; no preview or timer starts implicitly.
    selectedRef.current = id;
    setSelectedId(id); setDraft(null); setError(''); setNotice('');
    setCustomText(''); customDraftRef.current = null;
    excludedRef.current = []; operationRef.current = null;
  };

  const runAction = async (action) => {
    const id = selectedRef.current;
    if (!id || busyRef.current) return;
    busyRef.current = true; setBusy(action); setError(''); setNotice('');
    try {
      const penalty = penalties.find((item) => String(item.id) === id);
      let response;
      if (action === 'commit') {
        let candidate = draft;
        if (taskMode === 'custom') {
          if (!customDraftRef.current) customDraftRef.current = await requestRef.current(`/penalties/${id}/custom-preview`, { description: customText.trim() });
          candidate = customDraftRef.current;
        }
        response = await requestRef.current(`/penalties/${id}/commit`, { draft_token: candidate.draft_token });
      } else if (action === 'finish') {
        response = await requestRef.current(`/penalties/${id}/finish`, { session_id: penalty.session.id });
      } else {
        const taskId = penalty.session.current_task.id;
        const existing = operationRef.current;
        const operation = existing?.task_id === taskId && existing.action === action ? existing
          : { task_id: taskId, action, request_id: operationId() };
        operationRef.current = operation;
        response = await requestRef.current(`/penalties/${id}/task-action`, operation);
        await animate();
      }
      if (!alive.current || selectedRef.current !== id) return;
      updatePenalty(response); setDraft(null); operationRef.current = null; customDraftRef.current = null;
      setConfirmFinish(false);
      setNotice(action === 'commit' ? 'Задание зафиксировано. Отработка началась.'
        : action === 'finish' ? (response.remaining_hours > 0 ? `Зачтено 2 часа. Осталось отработать ${response.remaining_hours} ч.` : 'Отработка подтверждена. Ожидаем разблокировки.')
          : response.no_tasks_available ? 'Подходящих заданий пока нет. Обратись к ответственному; таймер продолжается.'
            : action === 'complete' ? 'Готово! Выдано следующее задание. Таймер продолжается.' : 'Задание заменено. Таймер продолжается.');
      playHaptic(sdkRef.current, 'notificationOccurred', 'success');
    } catch (failure) {
      if (alive.current) setError(failure.message);
      if (failure.code === 'draft_expired') customDraftRef.current = null;
      // A lost POST response is not proof of failure. Refresh authoritative state.
      await refresh(id).catch(() => {});
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy('');
    }
  };

  const penalty = penalties.find((item) => String(item.id) === selectedId);
  const session = penalty?.session?.status === 'active' ? penalty.session : null;
  const activeTask = session?.current_task;
  const customActiveTask = activeTask?.task_key?.startsWith('custom-');
  const endsAt = session?.ends_at || penalty?.legacy_ends_at;
  const remaining = endsAt ? Math.max(0, (Date.parse(endsAt) - now) / 1000) : 7200;
  const legacyExpired = !session && Boolean(penalty?.legacy_ends_at) && remaining === 0;
  const canStart = penalty && OPEN.includes(penalty.workoff_status);
  const completed = penalty && !canStart;
  const selectedTask = session ? activeTask : draft?.task;
  const rolling = busy === 'spin' || busy === 'complete' || busy === 'replace';
  const historyTasks = (penalty?.sessions || (penalty?.session ? [penalty.session] : []))
    .slice().reverse().flatMap((item) => item.tasks || []);

  const navigateView = (next) => {
    setView(next); setError('');
    if (next !== 'platform' && phase === 'error') setStartVersion((value) => value + 1);
    if (next === 'working') refreshWorkers().catch((failure) => { if (alive.current) setError(failure.message); });
  };

  // Mount the real platform, not an iframe or an external browser. Keep this
  // component alive so its scoped Telegram credential and task preview survive.
  if (view === 'platform' && renderPlatform && phase === 'ready') return renderPlatform(navigateView);

  return (
    <main className={`penalty-miniapp${session && view === 'issue' ? ' pm-running' : ''}${view === 'working' ? ' pm-working-view' : ''}`}>
      <div className="pm-content">
        <header className="pm-header">
          {view !== 'working' ? <><h1>Выдаватель пенальти</h1><img src="/penalty-miniapp-hero.webp" alt="Два нарисованных персонажа: бородатый в фиолетовой футболке и улыбающийся" width="350" height="250" /></>
            : <h1>Отрабатывают сейчас</h1>}
        </header>
        {phase === 'loading' && <p className="pm-state" role="status">Подключаемся к платформе…</p>}
        {phase === 'error' && <section className="pm-state"><p role="alert">{error}</p><a href="/miniapp/platform#/login">Войти на платформу</a><button type="button" onClick={() => setStartVersion((value) => value + 1)}>Повторить</button></section>}
        {phase === 'ready' && view === 'working' && <section aria-label="Ученики на отработке">
          <p className="pm-working-caption">Активный бассейн · {workers.length} {workers.length === 1 ? 'отработка' : 'отработок'}</p>
          {workers.length === 0 ? <div className="pm-state"><h2>Сейчас никто не отрабатывает</h2><p>После фиксации задания ученик появится здесь автоматически.</p></div>
            : <ul className="pm-working-list">{workers.map((worker) => {
              const deadline = worker.session?.ends_at || worker.legacy_ends_at;
              const seconds = deadline ? Math.max(0, (Date.parse(deadline) - now) / 1000) : null;
              return <li key={worker.id}><button type="button" disabled={Boolean(busy)} onClick={() => openWorker(worker)} aria-label={`Открыть отработку @${worker.student_name}`}>
                <span className="pm-worker-top"><strong>@{worker.student_name.replace(/^@/, '')}</strong><span className="pm-worker-time"><Clock3 size={15} />{seconds === null ? 'В работе' : seconds === 0 ? 'Ждёт подтверждения' : formatCountdown(seconds)}</span></span>
                <span className="pm-worker-task">{worker.session?.current_task?.title || 'Задание не отмечено'}</span>
                <span className="pm-worker-open">Открыть отработку<ChevronRight size={17} /></span>
              </button></li>;
            })}</ul>}
        </section>}
        {phase === 'ready' && view === 'issue' && penalties.length === 0 && <section className="pm-state"><h2>Пока нет пенальти для отработки</h2><p>Здесь появятся ученики с уже выданными пенальти активного бассейна.</p><a href="/miniapp/platform#/penalties">Открыть раздел «Штрафы»</a></section>}
        {phase === 'ready' && view === 'issue' && penalties.length > 0 && <>
          <section className="pm-controls" aria-label="Выдача задания">
            <label className="pm-student-row"><span>Кому выдаём</span><span className="pm-select-wrap">
              <select aria-label="Кому выдаём" value={selectedId} disabled={Boolean(busy)} onChange={(event) => selectPupil(event.target.value)}>
                <option value="">Выбери ученика</option>
                {penalties.map((item) => <option key={item.id} value={item.id}>@{item.student_name.replace(/^@/, '')}{item.pool_number ? ` · пенальти №${item.pool_number}` : ''}</option>)}
              </select><ChevronRight size={21} aria-hidden="true" />
            </span></label>
            <div className={`pm-duration${endsAt ? ' pm-duration-active' : ''}`}>
              <Clock3 size={31} strokeWidth={1.6} aria-hidden="true" />
              <div><strong>{endsAt ? formatCountdown(remaining) : completed ? 'Отработка подтверждена' : 'Отработка · 2 часа'}</strong>
                <p>{endsAt ? remaining > 0 ? 'Осталось из 2 часов' : 'Время вышло — нужно подтверждение'
                  : completed ? 'Разблокировку подтверждает ответственный' : 'Таймер начнётся после фиксации'}</p></div>
            </div>
            {penalty?.total_hours > 2 && <p className="pm-hours-note">Всего {penalty.total_hours} ч · зачтено {penalty.completed_hours} ч. Один этап — 2 часа.</p>}
            {legacyExpired && <div className="pm-state"><p>Эта отработка началась до выдачи задания в мини-апе. Её таймер сохранён.</p><a href={`/miniapp/platform#/penalties?status=in_workoff&student=${encodeURIComponent(penalty.student_name)}`}>Подтвердить в разделе «Штрафы»</a></div>}
            {!completed && !legacyExpired && <>
              {!session && <div className="pm-task-modes" role="group" aria-label="Способ выбора задания">
                <button type="button" aria-pressed={taskMode === 'random'} disabled={Boolean(busy)} onClick={() => setTaskMode('random')}><Shuffle size={17} />Рулетка</button>
                <button type="button" aria-pressed={taskMode === 'custom'} disabled={Boolean(busy)} onClick={() => setTaskMode('custom')}><Pencil size={17} />Своё задание</button>
              </div>}
              {session || taskMode === 'random' ? <>
              <h2 className="pm-section-label">{session ? 'Текущее задание' : draft ? 'Выпало задание' : 'Выбор задания'}</h2>
              <Roulette catalog={catalog} selected={selectedTask} spinning={rolling} pupilSelected={Boolean(penalty)} sdk={sdkRef.current} />
              </> : <label className="pm-custom-task"><span>Как ученик отработает пенальти</span>
                <textarea value={customText} disabled={!penalty || Boolean(busy)} maxLength={1000} rows={3} placeholder="Опиши свою идею задания…" onChange={(event) => { setCustomText(event.target.value); customDraftRef.current = null; }} />
                <small>Сохранится в истории · общий срок — 2 часа</small>
              </label>}
              {session && activeTask && <div className="pm-task-description"><p>{activeTask.description}</p><span>{customActiveTask ? 'Своё задание волонтёра · общий таймер отработки' : `Примерно ${activeTask.estimated_minutes} минут · не длительность всей отработки`}</span></div>}
              {session && !activeTask && <p className="pm-task-description">Подходящих заданий пока нет. Обратись к ответственному; таймер продолжается.</p>}
              <div className="pm-actions">
                {!session && <>
                  {taskMode === 'random' && <button type="button" className="pm-secondary" disabled={!canStart || Boolean(busy)} onClick={() => spin(selectedId, excludedRef.current.length >= catalog.length ? [] : excludedRef.current)}><Shuffle size={23} />{busy === 'spin' ? 'Крутим рулетку…' : draft ? 'Выбрать другое' : 'Выбрать'}</button>}
                  <button type="button" className="pm-primary" disabled={!canStart || (taskMode === 'custom' ? customText.trim().length < 3 : !draft) || Boolean(busy)} onClick={() => runAction('commit')}><Check size={23} />{busy === 'commit' ? 'Фиксируем…' : 'Зафиксировать пенальти'}</button>
                </>}
                {session && remaining > 0 && activeTask && <>
                  <button type="button" className="pm-secondary" disabled={Boolean(busy)} onClick={() => runAction('replace')}><Shuffle size={22} />Не подходит — заменить</button>
                  <button type="button" className="pm-primary" disabled={Boolean(busy)} onClick={() => runAction('complete')}><Check size={22} />{busy === 'complete' ? 'Выдаём следующее…' : 'Выполнено — следующее'}</button>
                </>}
                {session && remaining === 0 && <button ref={finishTriggerRef} type="button" className="pm-primary" disabled={Boolean(busy)} onClick={() => setConfirmFinish(true)}><Check size={22} />Подтвердить 2 часа отработки</button>}
              </div>
              <p className="pm-bottom-hint">{session ? 'Смена задания не обнуляет таймер' : 'Задание ещё не зафиксировано'}</p>
            </>}
          </section>
          {notice && <p className="pm-notice" role="status">{notice}</p>}
          {error && <div className="pm-error" role="alert"><p>{error}</p><button type="button" disabled={Boolean(busy)} onClick={() => refresh().then(() => setError('')).catch((failure) => setError(failure.message))}><RefreshCw size={16} />Обновить данные</button></div>}
          {historyTasks.length > 0 && <details className="pm-history"><summary><History size={19} />История заданий · {historyTasks.length}</summary><ol>{historyTasks.map((task) => <li key={task.id}><strong>{task.title}</strong><span>{TASK_STATES[task.status]} · @{task.assigned_by_nick || 'волонтёр'}</span></li>)}</ol></details>}
        </>}
        {view === 'working' && error && <p className="pm-error" role="alert">{error}</p>}
        <footer className="pm-footer"><a href="/miniapp/platform#/penalties">Штрафы на платформе</a><span>Задания пока тестовые</span></footer>
      </div>
      {phase === 'ready' && <MiniAppNav view={view} busy={Boolean(busy)} count={workers.length} onNavigate={(next) => {
        if (next === 'platform' && !renderPlatform) return false;
        navigateView(next);
      }} />}
      {confirmFinish && <div className="pm-dialog-backdrop" onKeyDown={(event) => {
        if (event.key === 'Escape' && !busy) { setConfirmFinish(false); finishTriggerRef.current?.focus(); }
        if (event.key === 'Tab') { const buttons = [...event.currentTarget.querySelectorAll('button:not(:disabled)')]; const first = buttons[0]; const last = buttons[buttons.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
      }}><section className="pm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="pm-finish-title" aria-describedby="pm-finish-description">
        <h2 id="pm-finish-title">Подтвердить отработку?</h2><p id="pm-finish-description">Подтверди, что ученик отработал эти 2 часа. Сам таймер не подтверждает выполнение и не разблокирует ученика.</p>
        <button type="button" className="pm-primary" disabled={Boolean(busy)} onClick={() => runAction('finish')}>Подтвердить 2 часа</button>
        <button type="button" autoFocus className="pm-secondary" disabled={Boolean(busy)} onClick={() => { setConfirmFinish(false); finishTriggerRef.current?.focus(); }}><X size={18} />Отмена</button>
      </section></div>}
    </main>
  );
}
