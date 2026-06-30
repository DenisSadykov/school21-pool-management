import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SlidersHorizontal, Shield, LogOut, ChevronDown } from 'lucide-react';
import { api, buildAuthenticatedAssetUrl, clearSession } from '../api';
import '../styles/Navbar.css';

const ROLE_LABELS = {
  volunteer: 'Волонтёр',
  tribe_master: 'Трайб-мастер',
  team_lead: 'Тимлид',
  admin: 'Админ',
};

function Navbar({ user, setUser }) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState(user);
  const ref = useRef(null);
  const navigate = useNavigate();
  const isStaff = user?.role === 'team_lead' || user?.role === 'admin';

  useEffect(() => {
    setProfile(user);
  }, [user]);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.get('/api/auth/me')
      .then((freshUser) => {
        if (cancelled || !freshUser) return;
        setProfile(freshUser);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const go = (path) => { setOpen(false); navigate(path); };
  const handleLogout = () => { clearSession(); setUser(null); };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <div className="navbar-brand">
          <img className="brand-logo" src="/school21-logo.webp" alt="School 21 logo" />
          <span className="brand-pool">School21 Pool</span>
        </div>

        <div className="navbar-actions">
          {isStaff && <div className="sync-state">synced</div>}

          <div className="navbar-user-wrap" ref={ref}>
            <button
              className={`navbar-user ${open ? 'active' : ''}`}
              onClick={() => isStaff ? setOpen(!open) : null}
              style={{ cursor: isStaff ? 'pointer' : 'default' }}
            >
              <span className="user-avatar">
                {profile?.avatar_url ? (
                  <img src={buildAuthenticatedAssetUrl(profile.avatar_url)} alt={profile?.name || profile?.nick || 'avatar'} />
                ) : (
                  (profile?.nick || 'AD').slice(0, 2).toUpperCase()
                )}
              </span>
              <span className="user-name">@{profile?.nick}</span>
              <span className="user-role">{ROLE_LABELS[profile?.role] || profile?.role}</span>
              {isStaff && <ChevronDown size={13} className={`dropdown-chevron ${open ? 'rotated' : ''}`} />}
            </button>

            {isStaff && open && (
              <div className="user-dropdown">
                <button className="dropdown-item" onClick={() => go('/settings')}>
                  <SlidersHorizontal size={15} /> Настройки
                </button>
                <button className="dropdown-item" onClick={() => go('/admin')}>
                  <Shield size={15} /> Администрирование
                </button>
                <div className="dropdown-divider" />
                <button className="dropdown-item danger" onClick={handleLogout}>
                  <LogOut size={15} /> Выйти
                </button>
              </div>
            )}
          </div>

          {!isStaff && (
            <button className="btn-logout" onClick={handleLogout} title="Выход">
              <LogOut size={18} />
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
