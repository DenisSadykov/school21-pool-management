import React, { useEffect, useState } from 'react';
import { CalendarDays, Clock3, Coins, Flag, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import '../styles/PersonalStatistics.css';

const number = (value) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value || 0);
const dateLabel = (value) => value ? new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Moscow',
}).format(new Date(`${value}T12:00:00+03:00`)) : 'Дата не указана';
const roles = { volunteer: 'Волонтёр', tribe_master: 'Трайб-мастер', tribe_assistant: 'Помощник трайб-мастера',
  team_lead: 'Тимлид', responsible_team_lead: 'Тимлид', responsible_admin: 'Администратор' };
const states = { active: 'Текущий', ended: 'Завершён', archived: 'В архиве' };

export default function PersonalStatistics({ userId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [poolFilter, setPoolFilter] = useState('all');

  useEffect(() => {
    let alive = true;
    setData(null);
    setError('');
    setPoolFilter('all');
    api.get('/api/me/statistics').then((payload) => {
      if (alive) setData(payload);
    }).catch((err) => {
      if (alive) setError(err.message || 'Не удалось загрузить статистику');
    });
    return () => { alive = false; };
  }, [userId, attempt]);

  if (error) return <section className="personal-panel personal-load" role="alert">
    <h2>Статистика пока недоступна</h2><p>{error}</p>
    <button className="btn-secondary" onClick={() => setAttempt((value) => value + 1)}>Повторить</button>
  </section>;
  if (!data) return <section className="personal-panel personal-load" role="status">Загружаем вашу историю…</section>;

  const { summary, pools, monthly_activity: activity } = data;
  const maxHours = Math.max(1, ...activity.map((item) => item.hours));
  const hasActivity = activity.some((item) => item.shifts > 0);
  const selectedPools = poolFilter === 'all' ? pools : pools.filter((item) => String(item.id) === poolFilter);
  const metrics = [
    { label: 'Бассейны в истории', value: summary.pools, note: `${number(summary.active_pools)} с прошедшей активностью`, Icon: Flag },
    { label: 'Прошедшие смены', value: summary.past_shifts, note: `${number(summary.upcoming_shifts)} ещё впереди или идут сейчас`, Icon: CalendarDays },
    { label: 'Часы по расписанию', value: summary.past_hours, note: 'В прошедших записях на смены', Icon: Clock3 },
    { label: 'Коины по расчёту', value: summary.coins, note: 'Все бассейны, включая будущие записи', Icon: Coins },
  ];

  return <div className="personal-statistics">
    <section className="personal-metrics" aria-label="Общая статистика">
      {metrics.map(({ label, value, note, Icon }) => <article className="personal-metric" key={label}>
        <span className="personal-metric-label"><Icon size={17} aria-hidden="true" />{label}</span>
        <strong>{number(value)}</strong><span className="personal-caption">{note}</span>
      </article>)}
    </section>
    <p className="personal-data-note">По сохранённым данным системы. Прошедшая запись не подтверждает фактический выход;
      коины рассчитаны по тем же правилам, что в разделе «Волонтёры», и не означают выплату.</p>

    <div className="personal-two-columns">
      <section className="personal-panel" aria-labelledby="activity-title">
        <div className="personal-section-title"><div><h2 id="activity-title">Ваш ритм</h2>
          <p>Часы в прошедших сменах · последние 12 месяцев</p></div><Clock3 size={20} aria-hidden="true" /></div>
        {!hasActivity && <p className="personal-empty">Когда появятся прошедшие смены, здесь будет виден ваш ритм участия.</p>}
        <div className="personal-chart" role="list" aria-label="Часы по месяцам">
          {activity.map((item) => {
            const month = new Date(`${item.month}-01T12:00:00+03:00`);
            const fullLabel = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' }).format(month);
            return <div className="personal-chart-column" key={item.month} role="listitem"
              aria-label={`${fullLabel}: ${number(item.hours)} ч., смен: ${item.shifts}`}>
              <span className="personal-chart-value">{item.hours ? number(item.hours) : '—'}</span>
              <div className="personal-chart-track" aria-hidden="true"><div className="personal-chart-bar"
                style={{ height: `${(item.hours / maxHours) * 100}%` }} /></div>
              <span className="personal-chart-label">{new Intl.DateTimeFormat('ru-RU', {
                month: 'short', timeZone: 'Europe/Moscow',
              }).format(month).replace('.', '')}</span>
            </div>;
          })}
        </div>
        <details className="personal-chart-details"><summary>Числа по месяцам</summary>
          <ul>{activity.map((item) => <li key={item.month}><span>{item.month}</span>
            <span>{number(item.hours)} ч. · {item.shifts} смен</span></li>)}</ul>
        </details>
      </section>
      <section className="personal-panel" aria-labelledby="next-shifts-title">
        <div className="personal-section-title"><div><h2 id="next-shifts-title">Впереди</h2>
          <p>Ваши ближайшие записи на смены</p></div><CalendarDays size={20} aria-hidden="true" /></div>
        {data.upcoming_shifts.length ? <ul className="personal-next-shifts">
          {data.upcoming_shifts.slice(0, 4).map((shift) => <li key={shift.id}>
            <div><strong>{dateLabel(shift.date)}</strong><span>{shift.pool_name}</span></div>
            <div className="personal-shift-time"><strong>{shift.time_start}–{shift.time_end}</strong>
              <span>{shift.in_progress ? 'Идёт сейчас' : shift.label === 'EXAM' ? 'Экзамен' : 'Дежурство'}</span></div>
          </li>)}
        </ul> : <p className="personal-empty">Будущих записей пока нет. Выбрать удобную смену можно в расписании.</p>}
        <Link className="personal-inline-link" to="/schedule">Открыть график смен <ArrowRight size={16} aria-hidden="true" /></Link>
      </section>
    </div>

    <section className="personal-panel" aria-labelledby="pool-history-title">
      <div className="personal-section-title"><div><h2 id="pool-history-title">История бассейнов</h2>
        <p>Роль, участие и расчёт коинов в каждом бассейне</p></div>
        {pools.length > 1 && <div className="personal-filter"><label htmlFor="personal-pool-filter">Бассейн</label>
          <select id="personal-pool-filter" value={poolFilter} onChange={(event) => setPoolFilter(event.target.value)}>
            <option value="all">Все бассейны</option>
            {pools.map((pool) => <option value={pool.id} key={pool.id}>{pool.name}</option>)}
          </select></div>}
      </div>
      {!pools.length && <p className="personal-empty">Пока нет привязок к бассейнам или сохранённой активности. История появится здесь автоматически.</p>}
      <div className="personal-pool-history">
        {selectedPools.map((pool) => <article className="personal-pool-card" key={pool.id}>
          <div className="personal-pool-heading"><div><h3>{pool.name}</h3>
            <p>{pool.start_date ? dateLabel(pool.start_date) : 'Без даты начала'} · {roles[pool.role] || 'Историческая активность'}{pool.tribe ? ` · ${pool.tribe}` : ''}</p></div>
            <span className={`personal-pool-state ${pool.state}`}>{states[pool.state]}</span></div>
          <dl className="personal-pool-numbers">
            <div><dt>Прошедшие смены</dt><dd>{number(pool.past_shifts)}</dd></div>
            <div><dt>Часы</dt><dd>{number(pool.past_hours)}</dd></div>
            <div><dt>Будущие / идут</dt><dd>{number(pool.upcoming_shifts)}</dd></div>
            <div><dt>Проверки групповых</dt><dd>{number(pool.group_reviews)}</dd></div>
            <div><dt>Встречи трайба</dt><dd>{number(pool.tribe_meetings)}</dd></div>
            <div className="personal-pool-coins"><dt>Коины по расчёту</dt><dd>{number(pool.coins)}</dd></div>
          </dl>
          {!!pool.shift_history?.length && <details className="personal-coin-details"><summary>Записи на смены · {pool.shift_history.length}</summary>
            <ul>{pool.shift_history.map((shift) => <li key={shift.id}>
              <span>{dateLabel(shift.date)} · {shift.time_start}–{shift.time_end}{shift.label === 'EXAM' ? ' · Экзамен' : ''}</span>
              <span>{shift.state === 'past' ? 'Прошедшая' : shift.state === 'in_progress' ? 'Идёт сейчас' : 'Будущая'} · {number(shift.hours)} ч.</span>
            </li>)}</ul>
          </details>}
          <details className="personal-coin-details"><summary>Из чего складываются коины</summary>
            {pool.coin_breakdown.length ? <ul>{pool.coin_breakdown.map((row) => <li key={row.type}>
              <span>{row.label} · {number(row.count)}</span><strong>{number(row.coins)}</strong></li>)}</ul>
              : <p className="personal-empty">Начислений по этому бассейну пока нет.</p>}
            {pool.manual_event_count !== null && <p className="personal-caption">Количество мероприятий для коинов задано вручную: {pool.manual_event_count}.
              Статистика встреч и ачивки считаются по самим мероприятиям.</p>}
          </details>
        </article>)}
      </div>
    </section>
    {data.unscoped_rewards.count > 0 && <section className="personal-panel">
      <h2>Старые начисления без бассейна</h2><p>{data.unscoped_rewards.count} записей · {number(data.unscoped_rewards.coins)} коинов.
        Показаны отдельно и не включены в общий итог, чтобы не смешивать истории.</p>
    </section>}
    {!!data.warnings.length && <ul className="personal-warnings">{data.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
    <p className="personal-caption">Данные на {new Intl.DateTimeFormat('ru-RU', {
      dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Moscow',
    }).format(new Date(`${data.as_of}+03:00`))} МСК · обновляются при открытии обзора.</p>
  </div>;
}
