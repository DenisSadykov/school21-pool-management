import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { MoreHorizontal, Plus } from 'lucide-react';
import { api, buildAuthenticatedAssetUrl } from '../api';
import Loader from '../components/Loader';
import TribeLabel from '../components/TribeLabel';
import '../styles/Pages.css';
import '../styles/Volunteers.css';

function getTelegramLink(telegram) {
  const username = (telegram || '').trim().replace(/^@+/, '');
  return username ? `https://t.me/${username}` : '';
}

function TelegramButton({ telegram, nick }) {
  const href = getTelegramLink(telegram);
  if (!href) return null;

  return (
    <a
      className="telegram-button"
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={`Написать @${nick} в Telegram`}
      title={`Написать ${telegram.startsWith('@') ? telegram : `@${telegram}`}`}
    >
      <img src="/icons/telegram.webp" alt="" />
    </a>
  );
}

function PersonIdentity({ person }) {
  return (
    <div className="person-identity">
      <span className="person-avatar">
        {person.avatar_url ? (
          <img src={buildAuthenticatedAssetUrl(person.avatar_url)} alt={person.name || person.nick} />
        ) : (
          (person.nick || '??').slice(0, 2).toUpperCase()
        )}
      </span>
      <div className="person-identity-text">
        <strong className="volunteer-nick">@{person.nick}</strong>
        {person.name && <div className="person-fullname">{person.name}</div>}
        <div className="person-meta">
          <span>{person.role === 'tribe_master' ? 'Трайб-мастер' : 'Волонтёр'}</span>
          <TelegramButton telegram={person.telegram} nick={person.nick} />
        </div>
      </div>
    </div>
  );
}

function Volunteers({ user }) {
  const [activePool, setActivePool] = useState(null);
  const [allVols, setAllVols] = useState([]);
  const [tribes, setTribes] = useState([]);
  const [loading, setLoading] = useState(true);
  const isStaff = user?.role === 'team_lead' || user?.role === 'admin';

  const loadVolunteers = useCallback(async (poolId) => {
    if (!poolId) {
      setAllVols([]);
      return;
    }

    const volList = await api.get(`/api/volunteers?pool_id=${poolId}`);
    const filtered = (volList || []).filter((v) =>
      ['volunteer', 'tribe_master'].includes(v.role)
    );
    setAllVols(filtered);
  }, []);

  const loadPage = useCallback(async () => {
    setLoading(true);
    try {
      const pool = await api.get('/api/pools/active');
      setActivePool(pool);
      if (!pool) {
        setAllVols([]);
        setTribes([]);
        return;
      }

      const [tribeList] = await Promise.all([
        api.get(`/api/tribes?pool_id=${pool.id}`),
        loadVolunteers(pool.id),
      ]);
      setTribes(tribeList || []);
    } finally {
      setLoading(false);
    }
  }, [loadVolunteers]);

  useEffect(() => { loadPage(); }, [loadPage]);

  const updateVolunteer = async (id, patch) => {
    try {
      setAllVols((prev) => prev.map((item) => (
        item.id === id ? { ...item, ...patch } : item
      )));
      await api.patch(`/api/volunteers/${id}`, { ...patch, pool_id: activePool?.id });
      loadVolunteers(activePool?.id);
    }
    catch (e) {
      loadVolunteers(activePool?.id);
      alert(e.message);
    }
  };

  if (loading) return <Loader text="Загрузка волонтёров..." />;

  if (!activePool) {
    return (
      <div className="page">
        <h1>Волонтёры</h1>
        <div className="empty-state">
          <p>Нет активного бассейна.</p>
          {isStaff && <Link to="/settings" className="btn-primary" style={{ display: 'inline-block', marginTop: 8 }}>Перейти в Настройки</Link>}
        </div>
      </div>
    );
  }

  const tribeMasters = allVols.filter((v) => v.role === 'tribe_master');
  const volunteers   = allVols.filter((v) => v.role === 'volunteer');
  const tribeNames = tribes.map((t) => t.name);

  return (
    <div className="page volunteers-page">

      {allVols.length === 0 && (
        <div className="empty-state">
          <p>На бассейн ещё не назначено волонтёров.</p>
          {isStaff && <Link to="/manage">Настройки бассейна →</Link>}
        </div>
      )}

      {/* Трайб-мастера */}
      {(tribeMasters.length > 0 || (isStaff && volunteers.length > 0)) && (
        <section className="volunteer-group volunteer-group-masters">
          <div className="group-title-row">
            <span className="group-title-label">Трайб-мастера</span>
            <strong>{tribeMasters.length}</strong>
            {isStaff && volunteers.length > 0 && (
              <AddTribeMasterInline volunteers={volunteers} onAdd={(id) => updateVolunteer(id, { role: 'tribe_master' })} />
            )}
          </div>
          {tribeMasters.length > 0 && (
            <div className="volunteer-table-wrap">
              <table className="volunteer-table">
                <thead>
                  <tr>
                    <th>Волонтёр</th>
                    <th>Имя</th>
                    <th>Трайб</th>
                    <th>Смены</th>
                    <th>Дополнения</th>
                    <th>Коины</th>
                    {isStaff && <th>Управление</th>}
                  </tr>
                </thead>
                <tbody>
                  {tribeMasters.map((v) => (
                    <TribeMasterRow key={v.id} volunteer={v} tribes={tribeNames}
                      isStaff={isStaff} onUpdate={updateVolunteer} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Волонтёры */}
      {volunteers.length > 0 && (
        <section className="volunteer-group">
          <div className="group-title-row">
            <span className="group-title-label">Волонтёры</span>
            <strong>{volunteers.length}</strong>
          </div>
          <div className="volunteer-table-wrap">
            <table className="volunteer-table">
              <thead>
                <tr>
                  <th>Волонтёр</th>
                  <th>Имя</th>
                  <th>Смены</th>
                  <th>Дополнения</th>
                  <th>Коины</th>
                  {isStaff && <th>Управление</th>}
                </tr>
              </thead>
              <tbody>
                {volunteers.map((v) => (
                  <VolunteerRow key={v.id} volunteer={v} isStaff={isStaff} onUpdate={updateVolunteer} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function AddTribeMasterInline({ volunteers, onAdd }) {
  const [userId, setUserId] = useState('');
  return (
    <div className="add-tm-inline">
      <select value={userId} onChange={(e) => setUserId(e.target.value)}>
        <option value="">Добавить трайб-мастера</option>
        {volunteers.map((v) => (
          <option key={v.id} value={v.id}>@{v.nick} {v.name ? `· ${v.name}` : ''}</option>
        ))}
      </select>
      <button className="btn-mini primary" disabled={!userId}
        onClick={() => { onAdd(Number(userId)); setUserId(''); }}>+</button>
    </div>
  );
}

function CoinsControl({ volunteer: v, canEdit, onUpdate }) {
  const [open, setOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [infoPinned, setInfoPinned] = useState(false);
  const [coins, setCoins] = useState(v.coins_adjustment || 0);
  const wrapRef = useRef(null);
  const [popoverStyle, setPopoverStyle] = useState(null);
  const [infoPopoverStyle, setInfoPopoverStyle] = useState(null);

  useEffect(() => { setCoins(v.coins_adjustment || 0); }, [v.coins_adjustment]);

  useEffect(() => {
    if (!open && !infoOpen) return undefined;

    const updatePosition = () => {
      if (!wrapRef.current) return;
      const rect = wrapRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const maxWidth = Math.max(180, viewportWidth - 24);
      const popoverWidth = Math.min(220, maxWidth);
      const infoWidth = Math.min(260, maxWidth);
      const popoverLeft = Math.min(
        Math.max(12, rect.right - popoverWidth),
        viewportWidth - popoverWidth - 12,
      );
      const infoLeft = Math.min(
        Math.max(12, rect.right - infoWidth),
        viewportWidth - infoWidth - 12,
      );
      const top = rect.bottom + 8;

      setPopoverStyle({
        position: 'fixed',
        top,
        left: popoverLeft,
        width: popoverWidth,
      });
      setInfoPopoverStyle({
        position: 'fixed',
        top,
        left: infoLeft,
        width: infoWidth,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, infoOpen]);

  useEffect(() => {
    if (!open) return undefined;
    const handleClickOutside = (event) => {
      if (!wrapRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, v.id]);

  useEffect(() => {
    if (!infoPinned) return undefined;
    const handleClickOutside = (event) => {
      if (!wrapRef.current?.contains(event.target)) {
        setInfoPinned(false);
        setInfoOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [infoPinned]);

  const breakdown = (v.coin_breakdown || []).filter((item) => item.coins !== 0 || item.count > 0);

  return (
    <div className="coins-control" ref={wrapRef}>
      <strong className="coins-value">{v.coins ?? '—'}</strong>
      <button
        type="button"
        className="coins-info"
        aria-label={`За что начислены коины для @${v.nick}`}
        title="За что начислены коины"
        onMouseEnter={() => {
          if (!infoPinned) setInfoOpen(true);
        }}
        onMouseLeave={() => {
          if (!infoPinned) setInfoOpen(false);
        }}
        onClick={() => {
          const nextPinned = !infoPinned;
          setInfoPinned(nextPinned);
          setInfoOpen(nextPinned);
        }}
      >
        i
      </button>
      {infoOpen && infoPopoverStyle && createPortal(
        <div className="coins-breakdown-popover coins-breakdown-popover-portal" style={infoPopoverStyle}>
          <span className="coins-popover-label">Начисление коинов</span>
          {breakdown.length > 0 ? (
            <div className="coins-breakdown-list">
              {breakdown.map((item) => (
                <span key={item.type}>{item.label}: {item.coins}</span>
              ))}
            </div>
          ) : (
            <span className="coins-breakdown-empty">Пока начислений нет</span>
          )}
        </div>,
        document.body,
      )}
      {canEdit && (
        <>
          <button
            type="button"
            className="coins-plus"
            onClick={() => setOpen((prev) => !prev)}
            aria-label={`Изменить коины для @${v.nick}`}
            title="Ручная корректировка коинов"
          >
            <Plus size={14} />
          </button>
          {open && popoverStyle && createPortal(
            <div className="coins-popover coins-popover-portal" style={popoverStyle}>
              <span className="coins-popover-label">Ручная корректировка</span>
              <div className="coin-editor">
                <input type="number" value={coins} onChange={(e) => setCoins(e.target.value)} aria-label="Коины" />
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    onUpdate(v.id, { coins_adjustment: coins });
                    setOpen(false);
                  }}
                >
                  OK
                </button>
              </div>
            </div>,
            document.body,
          )}
        </>
      )}
    </div>
  );
}

function VolunteerActionsMenu({ volunteer: v, onUpdate }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const [dropdownStyle, setDropdownStyle] = useState(null);

  useEffect(() => {
    if (!open) return undefined;

    const updatePosition = () => {
      if (!menuRef.current) return;
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const menuWidth = Math.min(Math.max(rect.width, 240), viewportWidth - 24);
      const left = Math.min(
        Math.max(12, rect.right - menuWidth),
        viewportWidth - menuWidth - 12,
      );

      setDropdownStyle({
        position: 'fixed',
        top: rect.bottom + 8,
        left,
        width: menuWidth,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, v.id]);

  useEffect(() => {
    if (!open) return undefined;
    const handleClickOutside = (event) => {
      const dropdownNode = document.querySelector(`[data-volunteer-menu="${v.id}"]`);
      if (!menuRef.current?.contains(event.target) && !dropdownNode?.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, v.id]);

  return (
    <div className={`volunteer-menu ${open ? 'open' : ''}`} ref={menuRef}>
      <button
        type="button"
        className="volunteer-menu-trigger"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={`Управление @${v.nick}`}
      >
        <MoreHorizontal size={18} />
      </button>
      {open && dropdownStyle && createPortal(
        <div
          className="volunteer-menu-dropdown volunteer-menu-dropdown-portal"
          data-volunteer-menu={v.id}
          style={dropdownStyle}
        >
          <label className="check-control">
            <input
              type="checkbox"
              checked={v.has_confession}
              onChange={(e) => onUpdate(v.id, { has_confession: e.target.checked })}
            />
            Исповедь
          </label>
          <select
            className="volunteer-role-select"
            value={v.role}
            onChange={(e) => {
              onUpdate(v.id, { role: e.target.value });
              setOpen(false);
            }}
          >
            <option value="volunteer">Волонтёр</option>
            <option value="tribe_master">Трайб-мастер</option>
          </select>
        </div>,
        document.body,
      )}
    </div>
  );
}

function TribeMasterRow({ volunteer: v, tribes, isStaff, onUpdate }) {
  return (
    <tr>
      <td data-label="Волонтёр">
        <PersonIdentity person={v} />
      </td>
      <td data-label="Имя">{v.name}</td>
      <td data-label="Трайб">
        {isStaff ? (
          <div className="tribe-select-wrap">
            <select value={v.tribe || ''} onChange={(e) => onUpdate(v.id, { tribe: e.target.value })}>
              <option value="">Не задан</option>
              {tribes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            {v.tribe && <TribeLabel tribe={v.tribe} size={18} showText={false} className="tribe-select-logo" />}
          </div>
        ) : (
          v.tribe ? <TribeLabel tribe={v.tribe} size={16} className="volunteer-tribe-pill" /> : '—'
        )}
      </td>
      <td data-label="Смены">{v.shifts_count ?? '—'}</td>
      <td data-label="Дополнения">
        <div className="status-list">
          {v.has_confession && <span className="status-pill confession">Исповедь</span>}
        </div>
      </td>
      <td data-label="Коины"><CoinsControl volunteer={v} canEdit={isStaff} onUpdate={onUpdate} /></td>
      {isStaff && (
        <td data-label="Управление">
          <VolunteerActionsMenu volunteer={v} onUpdate={onUpdate} />
        </td>
      )}
    </tr>
  );
}

function VolunteerRow({ volunteer: v, isStaff, onUpdate }) {
  return (
    <tr>
      <td data-label="Волонтёр">
        <PersonIdentity person={v} />
      </td>
      <td data-label="Имя">{v.name}</td>
      <td data-label="Смены">{v.shifts_count ?? '—'}</td>
      <td data-label="Дополнения">
        <div className="status-list">
          {v.is_group_reviewer && <span className="status-pill group">Групповой</span>}
          {v.has_confession && <span className="status-pill confession">Исповедь</span>}
        </div>
      </td>
      <td data-label="Коины"><CoinsControl volunteer={v} canEdit={isStaff} onUpdate={onUpdate} /></td>
      {isStaff && (
        <td data-label="Управление">
          <VolunteerActionsMenu volunteer={v} onUpdate={onUpdate} />
        </td>
      )}
    </tr>
  );
}

export default Volunteers;
