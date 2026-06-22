import React, { useState } from 'react';
import { Settings, Download, Upload, RefreshCw } from 'lucide-react';
import '../styles/Pages.css';

function Admin({ user }) {
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');

  if (user?.role !== 'admin' && user?.role !== 'team_lead') {
    return (
      <div className="page">
        <h1>🔒 Доступ запрещён</h1>
        <p className="text-muted">Только администраторы могут видеть эту страницу</p>
      </div>
    );
  }

  const handleExport = async () => {
    setSyncing(true);
    try {
      const response = await fetch('/api/export');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pool-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      setMessage('✅ Экспорт успешен');
    } catch (error) {
      setMessage('❌ Ошибка экспорта: ' + error.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const response = await fetch('/api/sync', { method: 'POST' });
      if (response.ok) {
        setMessage('✅ Синхронизация с Google Sheets успешна');
      } else {
        setMessage('❌ Ошибка синхронизации');
      }
    } catch (error) {
      setMessage('❌ Ошибка: ' + error.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleDatabaseReset = async () => {
    if (!window.confirm('⚠️ Это удалит ВСЕ данные! Вы уверены?')) return;
    setSyncing(true);
    try {
      const response = await fetch('/api/admin/reset', { method: 'POST' });
      if (response.ok) {
        setMessage('✅ База данных сброшена');
      }
    } catch (error) {
      setMessage('❌ Ошибка: ' + error.message);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="page">
      <h1>⚙️ Администрирование</h1>

      {message && (
        <div className={`alert ${message.includes('✅') ? 'success' : 'error'}`}>
          {message}
        </div>
      )}

      <div className="admin-grid">
        <section className="admin-section">
          <h2>🔄 Синхронизация данных</h2>
          <p>Синхронизируйте данные с Google Sheets для обновления всех информации</p>
          <button
            className="btn-primary"
            onClick={handleSync}
            disabled={syncing}
          >
            <RefreshCw size={20} />
            {syncing ? 'Синхронизация...' : 'Синхронизировать'}
          </button>
        </section>

        <section className="admin-section">
          <h2>⬇️ Экспорт данных</h2>
          <p>Скачайте все данные в формате JSON для резервной копии</p>
          <button
            className="btn-primary"
            onClick={handleExport}
            disabled={syncing}
          >
            <Download size={20} />
            Экспортировать
          </button>
        </section>

        <section className="admin-section warning">
          <h2>🗑️ Опасные операции</h2>
          <p className="text-muted">Используйте только если вы знаете, что делаете</p>
          <button
            className="btn-danger"
            onClick={handleDatabaseReset}
            disabled={syncing}
          >
            Сбросить базу данных
          </button>
        </section>
      </div>

      <section className="admin-section">
        <h2>ℹ️ Информация о системе</h2>
        <div className="info-list">
          <div className="info-item">
            <span>API версия:</span>
            <strong>v1.0.0</strong>
          </div>
          <div className="info-item">
            <span>Frontend версия:</span>
            <strong>v1.0.0</strong>
          </div>
          <div className="info-item">
            <span>База данных:</span>
            <strong>SQLite</strong>
          </div>
          <div className="info-item">
            <span>Последняя синхронизация:</span>
            <strong id="last-sync">—</strong>
          </div>
        </div>
      </section>
    </div>
  );
}

export default Admin;
