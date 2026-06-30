import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Calendar, Users, AlertCircle, BookOpen, Trophy, ClipboardCheck, SlidersHorizontal, Bell } from 'lucide-react';
import { api } from '../api';
import '../styles/Sidebar.css';
import TribeLabel from './TribeLabel';

function Sidebar({ user }) {
  const location = useLocation();
  const [isOpen, setIsOpen] = React.useState(true);
  const [activePool, setActivePool] = useState(null);
  const isStaff = user?.role === 'team_lead' || user?.role === 'admin';
  const canUseTribe = user?.role === 'tribe_master' || isStaff;
  const canUseGroupReviews = isStaff;

  useEffect(() => {
    api.get('/api/pools').then((pools) => {
      setActivePool((pools || []).find((p) => p.active) || null);
    }).catch(() => {});
  }, [location.pathname]);

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

  return (
    <aside className={`sidebar ${isOpen ? 'open' : 'closed'}`}>
      <button
        className="sidebar-toggle"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle sidebar"
      >
        ☰
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
      </nav>
    </aside>
  );
}

export default Sidebar;
