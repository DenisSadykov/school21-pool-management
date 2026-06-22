import React, { useEffect, useState } from 'react';
import { BarChart3, Users, Calendar, Trophy } from 'lucide-react';
import '../styles/Dashboard.css';

function Dashboard() {
  const [stats, setStats] = useState({
    totalShifts: 0,
    volunteers: 0,
    upcomingShifts: 0,
    totalCoins: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/stats');
        const data = await response.json();
        setStats(data);
      } catch (error) {
        console.error('Ошибка загрузки статистики:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) return <div className="loading">Загрузка...</div>;

  return (
    <div className="dashboard">
      <h1>Главная</h1>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon calendar">
            <Calendar size={32} />
          </div>
          <div className="stat-content">
            <h3>Всего смен</h3>
            <p className="stat-value">{stats.totalShifts}</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon users">
            <Users size={32} />
          </div>
          <div className="stat-content">
            <h3>Волонтёры</h3>
            <p className="stat-value">{stats.volunteers}</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon upcoming">
            <BarChart3 size={32} />
          </div>
          <div className="stat-content">
            <h3>Предстоящих смен</h3>
            <p className="stat-value">{stats.upcomingShifts}</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon coins">
            <Trophy size={32} />
          </div>
          <div className="stat-content">
            <h3>Коины (всего)</h3>
            <p className="stat-value">{stats.totalCoins}</p>
          </div>
        </div>
      </div>

      <div className="dashboard-sections">
        <section className="info-section">
          <h2>ℹ️ О системе</h2>
          <p>
            Добро пожаловать в систему управления бассейном School 21! Здесь вы можете:
          </p>
          <ul>
            <li>📅 Управлять расписанием смен</li>
            <li>👥 Вести список волонтёров</li>
            <li>🎮 Отслеживать коины и штрафы</li>
            <li>📊 Просматривать статистику</li>
            <li>🔄 Синхронизировать с Google Sheets</li>
          </ul>
        </section>

        <section className="info-section">
          <h2>🚀 Быстрый старт</h2>
          <ol>
            <li>Перейдите в раздел "Смены" для управления расписанием</li>
            <li>Откройте "Волонтёры" для просмотра списка участников</li>
            <li>Используйте "Награды" для отслеживания коинов</li>
            <li>Нажмите "Синхронизировать" для обновления Google Sheets</li>
          </ol>
        </section>
      </div>
    </div>
  );
}

export default Dashboard;
