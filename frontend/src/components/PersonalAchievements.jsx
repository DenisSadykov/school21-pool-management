import React, { useEffect, useRef, useState } from 'react';
import { Expand, X } from 'lucide-react';
import { api, API_URL, getToken } from '../api';
import '../styles/PersonalAchievements.css';

const dateLabel = (value) => new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow',
}).format(new Date(value));

function AchievementImage({ achievement }) {
  const [image, setImage] = useState({ url: '', failed: false });
  useEffect(() => {
    const controller = new AbortController();
    let url;
    setImage({ url: '', failed: false });
    fetch(`${API_URL}${achievement.image_url}`, {
      headers: { Authorization: `Bearer ${getToken()}` }, signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error('image unavailable');
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(blob);
      setImage({ url, failed: false });
    }).catch(() => {
      if (!controller.signal.aborted) setImage({ url: '', failed: true });
    });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [achievement.image_url]);
  if (image.failed) return <span className="achievement-image-state">Не удалось загрузить изображение</span>;
  if (!image.url) return <span className="achievement-image-state" role="status">Загружаем изображение…</span>;
  return <img src={image.url} alt={achievement.title}
    onError={() => setImage((value) => ({ ...value, failed: true }))} />;
}

function AchievementViewer({ achievement, onClose }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); if (previousFocus?.isConnected) previousFocus.focus(); };
  }, []);
  return <dialog className="achievement-viewer" ref={dialogRef}
    aria-labelledby="achievement-viewer-title" onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="achievement-viewer-body">
      <button type="button" className="achievement-viewer-close" onClick={onClose} autoFocus aria-label="Закрыть изображение">
        <X size={22} aria-hidden="true" />
      </button>
      <div className="achievement-viewer-image"><AchievementImage achievement={achievement} /></div>
      <h2 id="achievement-viewer-title">{achievement.title}</h2>
      <p className="achievement-date">Получена {dateLabel(achievement.granted_at)}</p>
    </div>
  </dialog>;
}

export default function PersonalAchievements({ userId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    let alive = true;
    setData(null); setError(''); setSelected(null);
    api.get('/api/me/achievements').then((items) => {
      if (alive) setData(items);
    }).catch((err) => { if (alive) setError(err.message || 'Не удалось загрузить ачивки'); });
    return () => { alive = false; };
  }, [userId, attempt]);

  if (error) return <section className="achievement-state" role="alert">
    <h2>Ачивки пока недоступны</h2><p>{error}</p>
    <button type="button" className="btn-secondary" onClick={() => setAttempt((value) => value + 1)}>Повторить</button>
  </section>;
  if (!data) return <section className="achievement-state" role="status">Загружаем ваши ачивки…</section>;
  return <section className="personal-awards" aria-labelledby="personal-awards-title">
    <div className="personal-awards-heading"><h2 id="personal-awards-title">Ваши ачивки</h2>
      {!!data.length && <span className="personal-awards-count">Получено: {data.length}</span>}</div>
    {!data.length ? <div className="achievement-state"><h3>Здесь появятся ваши ачивки</h3>
      <p>Выданные вам награды сохранятся в этой коллекции.</p></div> :
      <ul className="personal-awards-grid">{data.map((item) => <li key={item.award_id}>
        <button type="button" className="personal-award" onClick={() => setSelected(item)}
          aria-label={`Открыть ачивку «${item.title}»`} aria-haspopup="dialog">
          <span className="personal-award-image"><AchievementImage achievement={item} />
            <span className="personal-award-expand" aria-hidden="true"><Expand size={18} /></span></span>
          <span className="personal-award-copy"><span className="personal-award-title">{item.title}</span>
            <span className="achievement-date">Получена <time dateTime={item.granted_at}>{dateLabel(item.granted_at)}</time></span></span>
        </button>
      </li>)}</ul>}
    {selected && <AchievementViewer achievement={selected} onClose={() => setSelected(null)} />}
  </section>;
}
