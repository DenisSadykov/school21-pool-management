import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SlidersHorizontal, Shield, LogOut, ChevronDown, Menu, UserCircle2 } from 'lucide-react';
import { api, clearSession, POOLS_CHANGED_EVENT } from '../api';
import AuthenticatedImage from './AuthenticatedImage';
import ThemeToggle from './ThemeToggle';
import '../styles/Navbar.css';

const ROLE_LABELS = {
  volunteer: 'Волонтёр',
  tribe_master: 'Трайб-мастер',
  team_lead: 'Тимлид',
  admin: 'Админ',
};

function Navbar({ user, setUser, mobileSidebarOpen, onMobileMenuToggle, theme, onThemeToggle }) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState(user);
  const [activePool, setActivePool] = useState(null);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  const isStaff = user?.role === 'team_lead' || user?.role === 'admin';

  useEffect(() => {
    setProfile(user);
    setAvatarFailed(false);
  }, [user]);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    const loadActivePool = () => {
      api.get('/api/pools/active').then((pool) => {
        setActivePool(pool || null);
      }).catch(() => {});
    };

    loadActivePool();
    window.addEventListener(POOLS_CHANGED_EVENT, loadActivePool);
    return () => window.removeEventListener(POOLS_CHANGED_EVENT, loadActivePool);
  }, [user?.active_pool_id]);

  const go = (path) => { setOpen(false); navigate(path); };
  const handleLogout = () => { clearSession(); setUser(null); };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <div className="navbar-brand">
          <img className="brand-logo" src="/school21-logo.webp" alt="School 21 logo" />
          <span className="brand-pool">{activePool?.name || 'School21 Pool'}</span>
        </div>

        <div className="navbar-actions">
          <div className="navbar-user-wrap" ref={ref}>
            <button
              className={`navbar-user ${open ? 'active' : ''}`}
              onClick={() => setOpen(!open)}
            >
              <span className="user-avatar">
                {profile?.avatar_url && !avatarFailed ? (
                  <AuthenticatedImage
                    src={profile.avatar_url}
                    alt={profile?.name || profile?.nick || 'avatar'}
                    onError={() => setAvatarFailed(true)}
                  />
                ) : (
                  (profile?.nick || 'AD').slice(0, 2).toUpperCase()
                )}
              </span>
              <span className="user-name">@{profile?.nick}</span>
              <span className="user-role">{ROLE_LABELS[profile?.role] || profile?.role}</span>
              <ChevronDown size={13} className={`dropdown-chevron ${open ? 'rotated' : ''}`} />
            </button>

            {open && (
              <div className="user-dropdown">
                <button className="dropdown-item" onClick={() => go('/profile')}>
                  <UserCircle2 size={15} /> Личные данные
                </button>
                {isStaff && (
                  <>
                <button className="dropdown-item" onClick={() => go('/settings')}>
                  <SlidersHorizontal size={15} /> Настройки
                </button>
                <button className="dropdown-item" onClick={() => go('/admin')}>
                  <Shield size={15} /> Администрирование
                </button>
                  </>
                )}
                <ThemeToggle theme={theme} onToggle={onThemeToggle} />
                <div className="dropdown-divider" />
                <button className="dropdown-item danger" onClick={handleLogout}>
                  <LogOut size={15} /> Выйти
                </button>
              </div>
            )}
          </div>

          <button
            className={`navbar-mobile-menu ${mobileSidebarOpen ? 'active' : ''}`}
            onClick={onMobileMenuToggle}
            aria-label="Открыть меню"
            type="button"
          >
            <Menu size={20} />
          </button>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
