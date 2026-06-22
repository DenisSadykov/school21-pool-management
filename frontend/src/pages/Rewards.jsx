import React, { useState, useEffect } from 'react';
import { Trophy, TrendingUp, TrendingDown } from 'lucide-react';
import '../styles/Pages.css';

function Rewards() {
  const [rewards, setRewards] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRewards = async () => {
      try {
        const response = await fetch('/api/rewards');
        const data = await response.json();
        setRewards(data);
      } catch (error) {
        console.error('Ошибка загрузки наград:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchRewards();
  }, []);

  if (loading) return <div className="loading">Загрузка...</div>;

  const totalCoins = rewards.reduce((sum, r) => sum + r.coins, 0);

  return (
    <div className="page">
      <div className="page-header">
        <h1>🎮 Система вознаграждений</h1>
      </div>

      <div className="rewards-summary">
        <div className="summary-card">
          <Trophy size={32} />
          <h3>Всего коинов распределено</h3>
          <p className="summary-value">{totalCoins}</p>
        </div>
      </div>

      <div className="rewards-rules">
        <h2>📋 Правила начисления</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Действие</th>
              <th>Коины</th>
              <th>Описание</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>✅ Смена выполнена</td>
              <td className="value success">+1</td>
              <td>За полностью выполненную смену</td>
            </tr>
            <tr>
              <td>⏰ Опоздание (15+ мин)</td>
              <td className="value danger">-1</td>
              <td>За опоздание более 15 минут</td>
            </tr>
            <tr>
              <td>❌ Пропуск без уведомления</td>
              <td className="value danger">-2</td>
              <td>За пропуск смены без предупреждения</td>
            </tr>
            <tr>
              <td>🎉 Бонус активности</td>
              <td className="value success">+0.5</td>
              <td>Бонус за активное участие</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Волонтёр</th>
              <th>Тип</th>
              <th>Коины</th>
              <th>Дата</th>
            </tr>
          </thead>
          <tbody>
            {rewards.length === 0 ? (
              <tr><td colSpan="4" className="text-center">Нет записей</td></tr>
            ) : (
              rewards.map((reward, idx) => (
                <tr key={idx}>
                  <td>{reward.volunteer_name}</td>
                  <td>
                    {reward.coins > 0 ? (
                      <span className="badge badge-confirmed">
                        <TrendingUp size={14} /> {reward.type}
                      </span>
                    ) : (
                      <span className="badge badge-pending">
                        <TrendingDown size={14} /> {reward.type}
                      </span>
                    )}
                  </td>
                  <td className={reward.coins > 0 ? 'success' : 'danger'}>
                    {reward.coins > 0 ? '+' : ''}{reward.coins}
                  </td>
                  <td>{new Date(reward.date).toLocaleDateString('ru-RU')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Rewards;
