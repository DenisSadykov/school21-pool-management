import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Calendar, Users, AlertCircle, BookOpen, Settings, SlidersHorizontal, Trophy, ClipboardCheck } from 'lucide-react';
import '../styles/Sidebar.css';

function Sidebar({ user }) {
  const location = useLocation();
  const [isOpen, setIsOpen] = React.useState(true);
  const isStaff = user?.role === 'team_lead' || user?.role === 'admin';
  const canUseTribe = user?.role === 'tribe_master' || user?.role === 'admin';
  const canUseGroupReviews = isStaff;

  const menuItems = [
    { path: '/', label: 'Главная', icon: Home },
    { path: '/schedule', label: 'График смен', icon: Calendar },
    { path: '/penalties', label: 'Штрафы', icon: AlertCircle },
    { path: '/students', label: 'Ученики', icon: BookOpen },
    ...(canUseTribe ? [{ path: '/my-tribe', label: user?.role === 'admin' ? 'Трайбы' : 'Мой трайб', icon: Trophy }] : []),
    ...(canUseGroupReviews ? [{ path: '/group-reviews', label: 'Групповые', icon: ClipboardCheck }] : []),
    { path: '/volunteers', label: 'Волонтёры', icon: Users },
    ...(isStaff ? [{ path: '/manage', label: 'Настройка', icon: SlidersHorizontal }] : []),
    ...(isStaff ? [{ path: '/admin', label: 'Админ', icon: Settings }] : []),
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
        <div className="sidebar-section-label">Навигация</div>
        {menuItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
            title={item.label}
          >
            <item.icon size={20} />
            <span className="nav-label">{item.label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}

export default Sidebar;
