import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Calendar, Users, AlertCircle, BookOpen, Trophy, ClipboardCheck, SlidersHorizontal, Bell, Menu } from 'lucide-react';
import { api, POOLS_CHANGED_EVENT } from '../api';
import '../styles/Sidebar.css';
import TribeLabel from './TribeLabel';

function Sidebar({ user, mobileOpen, onMobileClose }) {
  const location = useLocation();
  const [isDesktopOpen, setIsDesktopOpen] = React.useState(true);
  const [isMobile, setIsMobile] = React.useState(() => (
    typeof window !== 'undefined' && window.innerWidth <= 768
  ));
  const [mounted, setMounted] = useState(false);
  const [activePool, setActivePool] = useState(null);
  const isStaff = user?.role === 'team_lead' || user?.role === 'admin';
  const canUseTribe = user?.role === 'tribe_master' || isStaff;
  const canUseGroupReviews = isStaff;

  useEffect(() => {
    const loadActivePool = () => {
      api.get('/api/pools/active').then((pool) => {
        setActivePool(pool || null);
      }).catch(() => {});
    };

    loadActivePool();
    window.addEventListener(POOLS_CHANGED_EVENT, loadActivePool);
    return () => window.removeEventListener(POOLS_CHANGED_EVENT, loadActivePool);
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function syncSidebarState() {
      const nextIsMobile = window.innerWidth <= 768;
      setIsMobile(nextIsMobile);
      if (!nextIsMobile) {
        setIsDesktopOpen(true);
      }
    }

    syncSidebarState();
    window.addEventListener('resize', syncSidebarState);
    return () => window.removeEventListener('resize', syncSidebarState);
  }, []);

  const menuItems = [
    { path: '/', label: 'Дашборд', icon: Home },
    { path: '/schedule', label: 'График смен', icon: Calendar },
    { path: '/penalties', label: 'Штрафы', icon: AlertCircle },
    { path: '/students', label: 'Ученики', icon: BookOpen },
    ...(canUseTribe ? [{ path: '/my-tribe', label: isStaff ? 'Трайбы' : 'Мой трайб', icon: Trophy }] : []),
    ...(canUseGroupReviews ? [{ path: '/group-reviews', label: 'Групповые', icon: ClipboardCheck }] : []),
    { path: '/volunteers', label: 'Волонтёры', icon: Users },
    ...(isStaff ? [{ path: '/notifications', label: 'Уведомления', icon: Bell }] : []),
    ...(isStaff ? [{ path: '/manage', label: 'Настройки бассейна', icon: SlidersHorizontal }] : []),
  ];

  const handleNavClick = () => {
    if (isMobile) {
      onMobileClose();
    }
  };

  const isOpen = isMobile ? mobileOpen : isDesktopOpen;

  return (
    <aside className={`sidebar ${isOpen ? 'open' : 'closed'} ${mounted ? 'animated' : ''}`}>
      <button
        className="sidebar-toggle"
        onClick={() => setIsDesktopOpen((prev) => !prev)}
        aria-label="Переключить сайдбар"
      >
        <Menu size={20} />
      </button>

      <nav className="sidebar-nav">
        {activePool && (
          <div className="sidebar-pool-name">
            <span className="sidebar-pool-dot" />
            <span>{activePool.name}</span>
          </div>
        )}
        <div className="sidebar-section-label">Навигация</div>
        {menuItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
            title={item.label}
            onClick={handleNavClick}
          >
            <span className="nav-icon-slot">
              {item.path === '/my-tribe' && user?.role === 'tribe_master' && user?.tribe ? (
                <TribeLabel tribe={user.tribe} size={16} showText={false} className="sidebar-tribe-icon sidebar-tribe-icon-leading" />
              ) : (
                <item.icon size={20} />
              )}
            </span>
            <span className="nav-label">{item.label}</span>
          </Link>
        ))}

        <a
          className="sidebar-duck-link"
          href="https://t.me/DenisSadykov"
          target="_blank"
          rel="noreferrer"
          aria-label="Открыть Telegram DenisSadykov"
          title="DenisSadykov в Telegram"
        >
          <img className="sidebar-duck-image" src="/duck-odessabu.png" alt="prod_by_odessabu" />
        </a>
      </nav>
    </aside>
  );
}

export default Sidebar;
