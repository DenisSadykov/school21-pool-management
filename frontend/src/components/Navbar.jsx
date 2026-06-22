import React from 'react';
import { LogOut, Settings } from 'lucide-react';
import '../styles/Navbar.css';

function Navbar({ user, setUser }) {
  const handleLogout = () => {
    localStorage.removeItem('user');
    setUser(null);
  };

  const handleSync = async () => {
    try {
      const response = await fetch('/api/sync', { method: 'POST' });
      if (response.ok) {
        alert('✅ Синхронизация с Google Sheets успешна!');
      }
    } catch (error) {
      alert('❌ Ошибка синхронизации: ' + error.message);
    }
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <div className="navbar-brand">
          <h1>🏊 School 21 Pool Management</h1>
        </div>

        <div className="navbar-actions">
          <button className="btn-sync" onClick={handleSync} title="Синхронизировать с Google Sheets">
            🔄 Синхронизировать
          </button>

          <button className="btn-download" title="Скачать как Google Sheets">
            ⬇️ Скачать
          </button>

          <div className="navbar-user">
            <span className="user-name">{user?.name || 'User'}</span>
            <span className="user-role">{user?.role || 'volunteer'}</span>
          </div>

          <button className="btn-icon" title="Настройки">
            <Settings size={20} />
          </button>

          <button className="btn-logout" onClick={handleLogout} title="Выход">
            <LogOut size={20} />
          </button>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
