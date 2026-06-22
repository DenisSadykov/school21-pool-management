import React, { useState, useEffect } from 'react';
import { Users } from 'lucide-react';
import '../styles/Pages.css';

function Volunteers() {
  const [volunteers, setVolunteers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchVolunteers = async () => {
      try {
        const response = await fetch('/api/volunteers');
        const data = await response.json();
        setVolunteers(data);
      } catch (error) {
        console.error('Ошибка загрузки волонтёров:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchVolunteers();
  }, []);

  if (loading) return <div className="loading">Загрузка волонтёров...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1>👥 Волонтёры</h1>
      </div>

      <div className="volunteers-grid">
        {volunteers.length === 0 ? (
          <p className="text-center">Нет волонтёров</p>
        ) : (
          volunteers.map((vol) => (
            <div key={vol.id} className="volunteer-card">
              <h3>{vol.name}</h3>
              <div className="vol-stats">
                <div className="stat">
                  <span className="label">Смен:</span>
                  <span className="value">{vol.shifts_count}</span>
                </div>
                <div className="stat">
                  <span className="label">Коины:</span>
                  <span className="value coins">{vol.coins}</span>
                </div>
                <div className="stat">
                  <span className="label">Штрафы:</span>
                  <span className="value danger">{vol.penalties}</span>
                </div>
              </div>
              <div className="vol-status">
                {vol.active ? (
                  <span className="badge-confirmed">✓ Активен</span>
                ) : (
                  <span className="badge-pending">✗ Неактивен</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default Volunteers;
