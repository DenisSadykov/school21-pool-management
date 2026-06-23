import React from 'react';
import { Calendar, LogOut, Users } from 'lucide-react';
import { clearSession } from '../api';
import '../styles/Navbar.css';

const ROLE_LABELS = {
  volunteer: 'Волонтёр',
  tribe_master: 'Трайб-мастер',
  team_lead: 'Тимлид',
  admin: 'Админ',
};

function Navbar({ user, setUser }) {
  const handleLogout = () => {
    clearSession();
    setUser(null);
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <div className="navbar-brand">
          <div className="brand-mark">S21</div>
          <h1>pool</h1>
          <span className="brand-separator">/</span>
          <span className="brand-pool">School21 Pool</span>
        </div>

        <div className="navbar-actions">
          <div className="navbar-metrics">
            <span><Calendar size={12} /> смены</span>
            <span><Users size={12} /> участники</span>
          </div>
          <div className="sync-state"><span /> synced</div>
          <div className="navbar-user">
            <span className="user-avatar">{(user?.nick || 'AD').slice(0, 2).toUpperCase()}</span>
            <span className="user-name">@{user?.nick}</span>
            <span className="user-role">{ROLE_LABELS[user?.role] || user?.role}</span>
          </div>

          <button className="btn-logout" onClick={handleLogout} title="Выход">
            <LogOut size={20} />
          </button>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
