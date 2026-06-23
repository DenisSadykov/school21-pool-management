import React, { useState, useEffect } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { API_URL, api, getToken } from '../api';
import '../styles/Pages.css';
import '../styles/Admin.css';

function Admin({ user }) {
  const [status, setStatus] = useState(null);
  const [backup, setBackup] = useState(null);
  const [actions, setActions] = useState([]);
  const [message, setMessage] = useState('');
  const [downloadLink, setDownloadLink] = useState(null);
  const [showFullLog, setShowFullLog] = useState(false);
  const isAdmin = user?.role === 'admin';

  const loadStatus = () => api.get('/api/admin/sync-status').then(setStatus).catch(() => {});
  const loadBackup = () => api.get('/api/admin/backup-status').then(setBackup).catch(() => {});
  const loadActions = () => api.get('/api/admin/action-log?limit=60').then(setActions).catch(() => []);

  useEffect(() => {
    loadStatus();
    loadBackup();
    loadActions();
  }, []);

  const downloadExcel = async () => {
    try {
      const filename = `pool-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
      const url = `${API_URL}/api/admin/export.xlsx?token=${encodeURIComponent(getToken())}`;
      setDownloadLink({ url, filename });
      window.location.assign(url);
      setMessage('✅ Если скачивание не началось, нажми ссылку ниже.');
      loadActions();
    } catch (e) {
      setMessage('❌ ' + e.message);
    }
  };

  const exportGoogleSheets = async () => {
    try {
      const result = await api.post('/api/admin/export/google-sheets', {});
      setMessage(`✅ ${result.message}`);
      loadActions();
    } catch (e) {
      setMessage('❌ ' + e.message);
    }
  };

  const createBackup = async () => {
    try {
      const result = await api.post('/api/admin/backup-now', {});
      setMessage(`✅ ${result.message}`);
      loadBackup();
      loadActions();
    } catch (e) {
      setMessage('❌ ' + e.message);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('⚠️ Это удалит ВСЕ данные (бассейны, смены, штрафы). Точно?')) return;
    if (window.prompt('Введи RESET для подтверждения') !== 'RESET') return;
    try {
      await api.post('/api/admin/reset', { confirm: 'RESET' });
      setMessage('✅ База сброшена. Перезайди в систему.');
    } catch (e) {
      setMessage('❌ ' + e.message);
    }
  };

  return (
    <div className="page">
      <h1>Администрирование</h1>
      {message && <div className={`alert ${message.includes('✅') ? 'success' : 'error'}`}>{message}</div>}

      <div className="admin-grid">
        <section className="admin-section">
          <h2><RefreshCw size={20} /> Синхронизация с Google Sheets</h2>
          {status ? (
            <div className="info-list">
              <div className="info-item"><span>Подключение настроено:</span>
                <strong>{status.configured ? '✅ да' : '❌ нет (нужен google_key.json)'}</strong></div>
              <div className="info-item"><span>В очереди (ждут отправки):</span><strong>{status.pending}</strong></div>
              <div className="info-item"><span>Отправлено:</span><strong>{status.sent}</strong></div>
              <div className="info-item"><span>Ошибок:</span><strong>{status.errors}</strong></div>
              <div className="info-item"><span>Последняя отправка:</span>
                <strong>{status.last_sent_at ? new Date(status.last_sent_at).toLocaleString('ru-RU') : '—'}</strong></div>
            </div>
          ) : <p className="text-muted">Загрузка...</p>}
          <p className="text-muted">Запись в таблицу идёт автоматически через очередь (День 2 — подключение).</p>
        </section>

        <section className="admin-section">
          <h2>Экспорт и резерв</h2>
          <div className="admin-actions">
            <button className="btn-secondary" type="button" onClick={downloadExcel}>Скачать Excel</button>
            <button className="btn-secondary" type="button" onClick={exportGoogleSheets}>Выгрузить в Google Sheets</button>
            <button className="btn-secondary" type="button" onClick={createBackup}>Создать резерв сейчас</button>
          </div>
          {downloadLink && (
            <a className="download-ready-link" href={downloadLink.url} download={downloadLink.filename}>
              Скачать готовый файл: {downloadLink.filename}
            </a>
          )}
          <div className="info-list">
            <div className="info-item"><span>Ежедневный резерв:</span>
              <strong>{backup?.today_exists ? 'создан сегодня' : 'ещё не создан сегодня'}</strong></div>
            <div className="info-item"><span>Последний резерв:</span>
              <strong>{backup?.latest_at ? new Date(backup.latest_at).toLocaleString('ru-RU') : '—'}</strong></div>
            <div className="info-item"><span>Папка:</span><strong>{backup?.backup_dir || '—'}</strong></div>
          </div>
          <p className="text-muted">Резерв создаётся автоматически один раз в сутки, пока запущен бэкенд.</p>
        </section>

        <section className="admin-section">
          <div className="admin-section-head">
            <h2>Журнал действий</h2>
            {actions.length > 0 && (
              <button className="btn-link" type="button" onClick={() => setShowFullLog(!showFullLog)}>
                {showFullLog ? 'Свернуть' : 'Показать всё'}
              </button>
            )}
          </div>
          {actions.length === 0 ? (
            <p className="text-muted">Действий пока нет.</p>
          ) : (
            <div className={`info-list action-log-list ${showFullLog ? 'expanded' : ''}`}>
              {actions.map((item) => (
                <div className="info-item" key={item.id}>
                  <span>
                    {new Date(item.created_at).toLocaleString('ru-RU')} · {item.actor_nick ? `@${item.actor_nick}` : 'система'}
                  </span>
                  <strong>{item.description || `${item.entity}: ${item.action}`}</strong>
                </div>
              ))}
            </div>
          )}
        </section>

        {isAdmin && (
          <section className="admin-section warning">
            <h2><AlertTriangle size={20} /> Опасные операции</h2>
            <p className="text-muted">Полный сброс базы. Только для админа.</p>
            <button className="btn-danger" onClick={handleReset}>Сбросить базу данных</button>
          </section>
        )}
      </div>
    </div>
  );
}

export default Admin;
