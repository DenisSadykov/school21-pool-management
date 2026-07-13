import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Calendar, Users, AlertCircle, BookOpen, Trophy, ClipboardCheck, SlidersHorizontal, Bell, Menu } from 'lucide-react';
import useIsMobile from '../useIsMobile';
import '../styles/Sidebar.css';
import TribeLabel from './TribeLabel';

function Sidebar({ user, mobileOpen, onMobileClose }) {
  const location = useLocation();
  const [isDesktopOpen, setIsDesktopOpen] = React.useState(true);
  const isMobile = useIsMobile();
  const [mounted, setMounted] = useState(false);
  const isStaff = user?.role === 'team_lead' || user?.role === 'admin';
  const canUseTribe = user?.role === 'tribe_master' || isStaff;
  const canUseGroupReviews = isStaff;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setIsDesktopOpen(true);
    }
  }, [isMobile]);

  const menuItems = [
    { path: '/', label: 'Дашборд', icon: Home, tone: 'home' },
    { path: '/schedule', label: 'График смен', icon: Calendar, tone: 'schedule' },
    { path: '/penalties', label: 'Штрафы', icon: AlertCircle, tone: 'penalties' },
    { path: '/students', label: 'Ученики', icon: BookOpen, tone: 'students' },
    ...(canUseTribe ? [{ path: '/my-tribe', label: isStaff ? 'Трайбы' : 'Мой трайб', icon: Trophy, tone: 'tribe' }] : []),
    ...(canUseGroupReviews ? [{ path: '/group-reviews', label: 'Групповые', icon: ClipboardCheck, tone: 'reviews' }] : []),
    { path: '/volunteers', label: 'Волонтёры', icon: Users, tone: 'volunteers' },
    ...(isStaff ? [{ path: '/notifications', label: 'Уведомления', icon: Bell, tone: 'notifications' }] : []),
    ...(isStaff ? [{ path: '/manage', label: 'Настройки бассейна', icon: SlidersHorizontal, tone: 'manage' }] : []),
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
        <div className="sidebar-section-label">Навигация</div>
        {menuItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`nav-item tone-${item.tone} ${location.pathname === item.path ? 'active' : ''}`}
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
