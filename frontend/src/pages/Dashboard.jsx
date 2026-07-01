import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  Bell,
  BookOpenCheck,
  Calendar,
  CalendarClock,
  CheckCircle,
  ExternalLink,
  FileText,
  PartyPopper,
  Trophy,
  Users,
  XCircle,
} from 'lucide-react';
import { api } from '../api';
import TribeLabel from '../components/TribeLabel';
import '../styles/Dashboard.css';

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

function getTelegramLink(telegram) {
  const username = (telegram || '').trim().replace(/^@+/, '');
  return username ? `https://t.me/${username}` : '';
}

function getTelegramBotLink(botUsername) {
  const username = (botUsername || '').trim().replace(/^@+/, '');
  return username ? `https://t.me/${username}` : '';
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function isPastDate(value) {
  return value < todayIso();
}

function tribePillClass(tribe) {
  switch ((tribe || '').trim()) {
    case 'Ленты':
      return 'tribe-pill-ribbons';
    case 'Короны':
      return 'tribe-pill-crowns';
    case 'Олени':
      return 'tribe-pill-deer';
    default:
      return '';
  }
}

function tomorrowCoverage(blocks = []) {
  const assigned = blocks.reduce((sum, block) => (
    sum + (block.count ?? block.volunteers?.length ?? 0)
  ), 0);
  const slots = blocks.reduce((sum, block) => (
    sum + (block.capacity ?? (block.count ?? block.volunteers?.length ?? 0))
  ), 0);
  return `${assigned} / ${slots}`;
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
        <h1>Дашборд</h1>
      </div>

      {isOps && <OpsDashboard data={data} />}
      {role === 'tribe_master' && <TribeMasterDashboard data={data} />}
      {role === 'volunteer' && <VolunteerDashboard data={data} user={user} />}
    </div>
  );
}

function OpsDashboard({ data }) {
  const penalty = data?.penalties || {};
  const telegram = data?.telegram || {};
  const notes = data?.dashboard_notes || [];
  const tomorrowCoverageLabel = tomorrowCoverage(data?.tomorrow_blocks || []);
  const telegramBotLink = getTelegramBotLink(telegram.bot_username);
  const penaltyLinks = [
    {
      icon: CalendarClock,
      label: 'Ожидают отработки',
      value: penalty.pending || 0,
      tone: 'upcoming',
      to: '/penalties?status=pending',
    },
    {
      icon: CheckCircle,
      label: 'Отрабатывают',
      value: penalty.in_workoff || 0,
      tone: 'calendar',
      to: '/penalties?status=in_workoff',
    },
    {
      icon: BookOpenCheck,
      label: 'Ждут разблокировки',
      value: penalty.awaiting_unlock || 0,
      tone: 'users',
      to: '/penalties?status=awaiting_unlock',
    },
    {
      icon: XCircle,
      label: 'Не пришли на отработку',
      value: penalty.overdue || 0,
      tone: 'danger',
      to: '/penalties?status=overdue',
    },
  ];
  return (
    <>
      <div className="dashboard-sections two-columns">
        {!telegram.linked && (
          <section className="info-section info-section-warning wide">
            <SectionTitle icon={Bell} title="Подключи Telegram-бота" tone="danger" />
            <div className="telegram-connect-card">
              <div className="telegram-connect-copy">
                <p>
                  {telegram.needs_username
                    ? 'Чтобы получать уведомления о сменах, заменах, штрафах и рассылках, сначала укажи свой Telegram username в системе.'
                    : 'Чтобы получать уведомления о сменах, заменах, штрафах и рассылках, привяжи Telegram-бота.'}
                </p>
                <p className="text-muted">
                  {telegram.username
                    ? `Текущий username в системе: ${telegram.username}.`
                    : 'Сейчас username в системе не указан.'}
                </p>
              </div>
              {telegramBotLink && (
                <a className="dashboard-action telegram-connect-action" href={telegramBotLink} target="_blank" rel="noreferrer">
                  Открыть бота <ExternalLink size={16} />
                </a>
              )}
            </div>
          </section>
        )}

        <section className="info-section wide dashboard-notes-section">
          <SectionTitle icon={FileText} title="Доска объявлений" meta={notes.length || null} tone="upcoming" />
          <DashboardNotes notes={notes} />
        </section>

        <section className="info-section">
          <SectionTitle
            icon={Calendar}
            title={`Кто дежурит завтра, ${formatDate(data?.tomorrow)}`}
            meta={tomorrowCoverageLabel}
            tone="calendar"
          />
          <TomorrowBlocks blocks={data?.tomorrow_blocks || []} />
        </section>

        <section className="info-section">
          <SectionTitle icon={AlertCircle} title="Штрафы и разблокировка" tone="danger" />
          <div className="attention-grid">
            {penaltyLinks.map((item) => (
              <Link className="attention-card" to={item.to} key={item.label}>
                <div className={`stat-icon ${item.tone}`}>
                  <item.icon size={20} />
                </div>
                <div className="attention-card-content">
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="info-section wide">
          <SectionTitle icon={Users} title="Ближайшие трайб-мероприятия" tone="users" />
          <TribeEventList events={data?.tomorrow_tribe_events || []} empty="На завтра трайб-мероприятий нет." />
        </section>
      </div>
    </>
  );
}

function TribeMasterDashboard({ data }) {
  const tribe = data?.tribe || {};
  const telegram = data?.telegram || {};
  const notes = data?.dashboard_notes || [];
  const telegramBotLink = getTelegramBotLink(telegram.bot_username);
  return (
    <>
      <div className="stats-grid ops-grid">
        <StatCard
          icon={Users}
          label={tribe.tribe ? (
            <span className="stat-tribe-label">
              <span>Ученики трайба</span>
              <TribeLabel tribe={tribe.tribe} size={16} />
            </span>
          ) : 'Ученики трайба'}
          value={tribe.students_count || 0}
          tone="users"
        />
        <StatCard icon={CalendarClock} label="Мероприятий учеников" value={tribe.events_total || 0} tone="upcoming" />
        <StatCard icon={PartyPopper} label="Развлекательные" value={tribe.entertainment_events || 0} tone="upcoming" />
        <StatCard icon={BookOpenCheck} label="Обучающие" value={tribe.education_events || 0} tone="calendar" />
        <StatCard icon={Trophy} label="Место среди трайбов" value={tribe.rank ? `${tribe.rank}/3` : '—'} tone="coins" />
      </div>

      <div className="dashboard-sections two-columns">
        {!telegram.linked && (
          <section className="info-section info-section-warning">
            <SectionTitle icon={Bell} title="Подключи Telegram-бота" tone="danger" />
            <div className="telegram-connect-card">
              <div className="telegram-connect-copy">
                <p>
                  {telegram.needs_username
                    ? 'Чтобы получать уведомления о своих сменах и мероприятиях трайба, сначала укажи Telegram username.'
                    : 'Чтобы получать уведомления о сменах и событиях трайба, привяжи Telegram-бота.'}
                </p>
              </div>
              {telegramBotLink && (
                <a className="dashboard-action telegram-connect-action" href={telegramBotLink} target="_blank" rel="noreferrer">
                  Открыть бота <ExternalLink size={16} />
                </a>
              )}
            </div>
          </section>
        )}

        <section className="info-section wide dashboard-notes-section">
          <SectionTitle icon={FileText} title="Доска объявлений" meta={notes.length || null} tone="upcoming" />
          <DashboardNotes notes={notes} />
        </section>

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

function VolunteerDashboard({ data, user }) {
  const shifts = data?.my_shifts || [];
  const tomorrowExam = shifts.find((shift) => shift.date === data?.tomorrow && shift.label === 'EXAM');
  const todayExam = shifts.find((shift) => shift.date === todayIso() && shift.label === 'EXAM');
  const nextExam = shifts.find((shift) => shift.label === 'EXAM');
  const briefAvailable = Boolean(todayExam || tomorrowExam);
  const telegram = data?.telegram || {};
  const notes = data?.dashboard_notes || [];
  const telegramBotLink = getTelegramBotLink(telegram.bot_username);

  return (
    <>
      <div className="dashboard-sections volunteer-dashboard-sections">
        {!telegram.linked && (
          <section className="info-section info-section-warning">
            <SectionTitle icon={Bell} title="Подключи Telegram-бота" tone="danger" />
            <div className="telegram-connect-card">
              <div className="telegram-connect-copy">
                <p>
                  {telegram.needs_username
                    ? 'Чтобы получать уведомления о сменах и штрафах, сначала укажи свой Telegram username в профиле.'
                    : 'Чтобы получать уведомления о сменах, заменах и пенальти, привяжи аккаунт к Telegram-боту.'}
                </p>
                <p className="text-muted">
                  {telegram.username
                    ? `Текущий username в системе: ${telegram.username}.`
                    : 'Сейчас username в системе не указан.'}
                </p>
              </div>
              {telegramBotLink && (
                <a className="dashboard-action telegram-connect-action" href={telegramBotLink} target="_blank" rel="noreferrer">
                  Открыть бота <ExternalLink size={16} />
                </a>
              )}
            </div>
          </section>
        )}

        <section className="info-section dashboard-notes-section">
          <SectionTitle icon={FileText} title="Доска объявлений" meta={notes.length || null} tone="upcoming" />
          <DashboardNotes notes={notes} />
        </section>

        <section className="info-section">
          <SectionTitle icon={Calendar} title="Мои смены" meta={shifts.length} />
          <VolunteerShiftCards blocks={shifts} currentUser={user} />
        </section>

        <section className="info-section">
          <SectionTitle icon={BookOpenCheck} title="Экзамен" />
          {tomorrowExam ? (
            <>
              <p className="text-muted">Завтра экзамен в твоей смене. Бриф перед экзаменом пройдет в 11:10.</p>
              {briefAvailable && (
                <Link className="dashboard-action" to="/exam-brief">
                  Открыть бриф <ExternalLink size={16} />
                </Link>
              )}
            </>
          ) : todayExam ? (
            <>
              <p className="text-muted">Сегодня у тебя экзаменационная смена. Бриф доступен для повторного просмотра.</p>
              <Link className="dashboard-action" to="/exam-brief">
                Открыть бриф <ExternalLink size={16} />
              </Link>
            </>
          ) : nextExam ? (
            <>
              <p className="text-muted">
                Ближайший экзамен в твоих сменах: {formatDate(nextExam.date)}{nextExam.time_start ? ` в ${nextExam.time_start}` : ''}.
                Бриф станет доступен за день до экзамена и в день экзамена. Время брифа: 11:10.
              </p>
            </>
          ) : (
            <p className="text-muted">Ближайшего экзамена в твоих сменах на завтра нет.</p>
          )}
        </section>
      </div>
    </>
  );
}

function DashboardNotes({ notes }) {
  if (!notes.length) {
    return <p className="text-muted">Пока нет активных заметок для волонтерского состава.</p>;
  }
  return (
    <div className="dashboard-notes-list">
      {notes.map((note) => (
        <article
          key={note.id}
          className={`dashboard-note-card ${note.is_highlighted ? 'is-highlighted' : ''}`}
        >
          <div className="dashboard-note-meta">
            <strong>
              {note.is_pinned ? 'Закреплено' : 'Объявление'}
              {note.is_pinned ? ' 📌' : ''}
              {note.is_highlighted ? ' 🔥' : ''}
            </strong>
            <span>{formatDashboardAuthor(note)}</span>
          </div>
          <p>{note.text}</p>
        </article>
      ))}
    </div>
  );
}

function formatDashboardAuthor(note) {
  if (note?.is_anonymous) return 'анонимно';
  if (note?.author_name && note?.author_nick) return `${note.author_name} (@${note.author_nick})`;
  if (note?.author_nick) return `@${note.author_nick}`;
  return 'система';
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

function SectionTitle({ icon: Icon, title, meta = null, tone = '' }) {
  return (
    <h2 className="section-title">
      <span className="section-title-main">
        <Icon size={20} className={tone ? `section-title-icon ${tone}` : 'section-title-icon'} />
        {title}
      </span>
      {meta && <span className="section-title-meta">{meta}</span>}
    </h2>
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
            <span className={`shift-label tribe-pill ${tribePillClass(event.tribe)}`}>
              <span className="shift-label-prefix">Трайб </span>
              <TribeLabel tribe={event.tribe} size={14} />
            </span>
          </div>
          <p>{event.title}{event.location ? ` · ${event.location}` : ''}</p>
        </div>
      ))}
    </div>
  );
}

function VolunteerShiftCards({ blocks, currentUser }) {
  if (!blocks.length) return <p className="text-muted">Ближайших смен пока нет.</p>;

  const byDate = blocks.reduce((acc, block) => {
    if (!acc[block.date]) acc[block.date] = [];
    acc[block.date].push(block);
    return acc;
  }, {});

  return (
    <div className="volunteer-day-grid">
      {Object.entries(byDate).map(([date, dayBlocks]) => {
        const pastDay = isPastDate(date);
        const hasUpcomingExam = dayBlocks.some((block) => block.label === 'EXAM' && !pastDay);
        const cardClassName = [
          'volunteer-day-card',
          pastDay ? 'is-past' : '',
          hasUpcomingExam ? 'is-exam-upcoming' : '',
        ].filter(Boolean).join(' ');

        return (
        <div className={cardClassName} key={date}>
          <div className="volunteer-day-card-head">
            <strong>{formatDate(date)}</strong>
            <span>{new Date(`${date}T00:00:00`).toLocaleDateString('ru-RU', { weekday: 'long' })}</span>
          </div>
          <div className="volunteer-day-blocks">
            {dayBlocks.map((block) => {
              const teammates = (block.volunteers || []).filter((person) => person.id !== currentUser?.id);
              return (
                <div className="volunteer-day-block" key={block.id}>
                  <div className="volunteer-day-block-meta">
                    <strong>{block.time_start}-{block.time_end}</strong>
                    {block.label === 'EXAM' ? <span className="shift-label exam-brief-badge">Экзамен</span> : null}
                  </div>
                  <div className="volunteer-day-people">
                    <span className="volunteer-day-people-label">С кем дежуришь:</span>
                    {teammates.length > 0 ? (
                      <div className="volunteer-day-people-list">
                        {teammates.map((person) => (
                          <span className="volunteer-teammate-pill" key={person.id}>
                            <span className="volunteer-teammate-pill-text">@{person.nick}</span>
                            <span className="volunteer-teammate-pill-sep">/</span>
                            <span className="volunteer-teammate-pill-text">{person.name || 'Без имени'}</span>
                            {getTelegramLink(person.telegram) && (
                              <a
                                className="volunteer-teammate-pill-tg"
                                href={getTelegramLink(person.telegram)}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={`Написать @${person.nick} в Telegram`}
                                title={`Написать ${person.telegram}`}
                              >
                                <img src="/icons/telegram.webp" alt="" />
                              </a>
                            )}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted">Ты один в этой смене</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )})}
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
