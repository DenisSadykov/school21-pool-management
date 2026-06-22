import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Calendar, Users, Trophy, AlertCircle, BookOpen, Settings } from 'lucide-react';
import '../styles/Sidebar.css';

function Sidebar() {
  const location = useLocation();
  const [isOpen, setIsOpen] = React.useState(true);

  const menuItems = [
    { path: '/', label: 'Главная', icon: Home },
    { path: '/shifts', label: 'Смены', icon: Calendar },
    { path: '/students', label: 'Ученики', icon: BookOpen },
    { path: '/volunteers', label: 'Волонтёры', icon: Users },
    { path: '/penalties', label: 'Штрафы', icon: AlertCircle },
    { path: '/rewards', label: 'Награды', icon: Trophy },
    { path: '/admin', label: 'Админ', icon: Settings },
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

      <div className="sidebar-footer">
        <a href="https://github.com/school21/pool-management" target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
      </div>
    </aside>
  );
}

export default Sidebar;
