import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  BookOpenCheck,
  Calendar,
  CalendarClock,
  CheckCircle,
  ExternalLink,
  Trophy,
  Users,
} from 'lucide-react';
import { api } from '../api';
import '../styles/Dashboard.css';

const ROLE_TITLE = {
  admin: 'Админ-пульт',
  team_lead: 'Пульт тимлида',
  tribe_master: 'Мой трайб сегодня',
  volunteer: 'Мои смены',
};

function formatDate(value) {
  if (!value) return '';
  return new Date(`${value}T00:00:00`).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'long',
  });
}

function personLine(person) {
  if (!person) return '';
  return `@${person.nick}${person.telegram ? ` · tg: ${person.telegram}` : ''}`;
}

function Dashboard({ user }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/dashboard')
      .then(setData)
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Загрузка...</div>;

  const role = user.role;
  const isOps = role === 'admin' || role === 'team_lead';

  return (
    <div className="dashboard">
      <div className="dashboard-head">
        <div>
          <p className="eyebrow">{ROLE_TITLE[role] || 'Главная'}</p>
          <h1>Привет, @{user.nick}</h1>
        </div>
        {data?.pool ? (
          <div className="active-pool">
            <span>Активный бассейн</span>
            <strong>{data.pool.name}</strong>
          </div>
        ) : (
          <div className="active-pool warning">Активного бассейна нет</div>
        )}
      </div>

      {isOps && <OpsDashboard data={data} />}
      {role === 'tribe_master' && <TribeMasterDashboard data={data} />}
      {role === 'volunteer' && <VolunteerDashboard data={data} />}
    </div>
  );
}

function OpsDashboard({ data }) {
  const penalty = data?.penalties || {};
  return (
    <>
      <div className="stats-grid ops-grid">
        <StatCard icon={CalendarClock} label="Дежурств завтра" value={data?.tomorrow_blocks?.length || 0} tone="upcoming" />
        <StatCard icon={AlertCircle} label="Ждут отработки" value={penalty.pending || 0} tone="danger" />
        <StatCard icon={CheckCircle} label="В отработке" value={penalty.in_workoff || 0} tone="calendar" />
        <StatCard icon={BookOpenCheck} label="Ждут разблокировки" value={penalty.awaiting_unlock || 0} tone="users" />
      </div>

      <div className="dashboard-sections two-columns">
        <section className="info-section">
          <SectionTitle icon={Calendar} title={`Кто дежурит завтра, ${formatDate(data?.tomorrow)}`} />
          <TomorrowBlocks blocks={data?.tomorrow_blocks || []} />
        </section>

        <section className="info-section">
          <SectionTitle icon={AlertCircle} title="Штрафы и разблокировка" />
          <div className="attention-list">
            <MetricRow label="Ученики со штрафами" value={penalty.students_with_penalties || 0} />
            <MetricRow label="Ожидают отработки" value={penalty.pending || 0} />
            <MetricRow label="Переходящие / не пришли" value={penalty.overdue || 0} />
            <MetricRow label="Отработали и ждут разблокировки" value={penalty.awaiting_unlock || 0} />
          </div>
          <Link className="dashboard-action" to="/penalties">
            Открыть штрафы <ExternalLink size={16} />
          </Link>
        </section>

        <section className="info-section wide">
          <SectionTitle icon={Users} title="Ближайшие трайб-мероприятия" />
          <TribeEventList events={data?.tomorrow_tribe_events || []} empty="На завтра трайб-мероприятий нет." />
        </section>
      </div>
    </>
  );
}

function TribeMasterDashboard({ data }) {
  const tribe = data?.tribe || {};
  return (
    <>
      <div className="stats-grid ops-grid">
        <StatCard icon={Users} label={`Ученики трайба ${tribe.tribe || ''}`} value={tribe.students_count || 0} tone="users" />
        <StatCard icon={CalendarClock} label="Мероприятий учеников" value={tribe.events_total || 0} tone="upcoming" />
        <StatCard icon={BookOpenCheck} label="Обучающие" value={tribe.education_events || 0} tone="calendar" />
        <StatCard icon={Trophy} label="Место среди трайбов" value={tribe.rank ? `${tribe.rank}/3` : '—'} tone="coins" />
      </div>

      <div className="dashboard-sections two-columns">
        <section className="info-section">
          <SectionTitle icon={Calendar} title="Ближайшие встречи трайба" />
          <TribeEventList events={tribe.next_events || []} empty="Пока нет назначенных встреч трайба." />
          <Link className="dashboard-action" to="/my-tribe">
            Открыть мой трайб <ExternalLink size={16} />
          </Link>
        </section>

        <section className="info-section">
          <SectionTitle icon={Trophy} title="Топ учеников по мероприятиям" />
          <TopStudents students={tribe.top_students || []} />
        </section>
      </div>
    </>
  );
}

function VolunteerDashboard({ data }) {
  const tomorrowShift = (data?.my_shifts || []).find((shift) => shift.date === data?.tomorrow);
  return (
    <>
      <div className="stats-grid ops-grid">
        <StatCard icon={CheckCircle} label="Мои ближайшие смены" value={data?.my_shifts?.length || 0} tone="calendar" />
        <StatCard icon={CalendarClock} label="Завтра смена" value={tomorrowShift ? 'Да' : 'Нет'} tone={tomorrowShift ? 'upcoming' : 'users'} />
      </div>

      <div className="dashboard-sections two-columns">
        <section className="info-section">
          <SectionTitle icon={Calendar} title="Мои смены" />
          <TomorrowBlocks blocks={data?.my_shifts || []} personal />
        </section>

        <section className="info-section">
          <SectionTitle icon={BookOpenCheck} title="Экзамен" />
          {tomorrowShift?.label === 'EXAM' ? (
            <>
              <p className="text-muted">Завтра дежурство на экзамене. Перед сменой стоит быстро освежить правила.</p>
              <a className="dashboard-action" href="/exam-brief.html" target="_blank" rel="noreferrer">
                Правила экзамена <ExternalLink size={16} />
              </a>
            </>
          ) : (
            <p className="text-muted">Ближайшего экзамена в твоих сменах на завтра нет.</p>
          )}
        </section>
      </div>
    </>
  );
}

function StatCard({ icon: Icon, label, value, tone }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}><Icon size={30} /></div>
      <div className="stat-content">
        <h3>{label}</h3>
        <p className="stat-value">{value}</p>
      </div>
    </div>
  );
}

function SectionTitle({ icon: Icon, title }) {
  return (
    <h2 className="section-title">
      <Icon size={20} />
      {title}
    </h2>
  );
}

function MetricRow({ label, value }) {
  return (
    <div className="metric-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TomorrowBlocks({ blocks, personal = false }) {
  if (!blocks.length) {
    return <p className="text-muted">{personal ? 'Ближайших смен пока нет.' : 'На завтра смен не найдено.'}</p>;
  }
  return (
    <div className="shift-list">
      {blocks.map((block) => (
        <div className="shift-row" key={block.id}>
          <div>
            <strong>{formatDate(block.date)} · {block.time_start}-{block.time_end}</strong>
            {block.label && <span className="shift-label">{block.label}</span>}
          </div>
          <div className="people-list">
            {(block.volunteers || []).length === 0 ? (
              <span className="text-muted">Пока никто не записан</span>
            ) : (
              block.volunteers.map((person) => (
                <span key={person.id}>{personLine(person)}</span>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function TribeEventList({ events, empty }) {
  if (!events.length) return <p className="text-muted">{empty}</p>;
  return (
    <div className="shift-list">
      {events.map((event) => (
        <div className="shift-row" key={event.id}>
          <div>
            <strong>{formatDate(event.date)}{event.time_start ? ` · ${event.time_start}` : ''}</strong>
            <span className="shift-label">Трайб {event.tribe}</span>
          </div>
          <p>{event.title}{event.location ? ` · ${event.location}` : ''}</p>
        </div>
      ))}
    </div>
  );
}

function TopStudents({ students }) {
  if (!students.length) return <p className="text-muted">Пока нет ученических мероприятий.</p>;
  return (
    <div className="leader-list">
      {students.map((student, index) => (
        <div className="leader-row" key={student.id}>
          <span>{index + 1}. @{student.nick}</span>
          <strong>{student.events_total}</strong>
        </div>
      ))}
    </div>
  );
}

export default Dashboard;
