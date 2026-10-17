import React from 'react';
import { LayoutDashboard, Shuffle, Users } from 'lucide-react';

export default function MiniAppNav({ view, busy = false, count, onNavigate }) {
  const navigate = (event, next) => {
    if (busy) { event.preventDefault(); return; }
    if (onNavigate && onNavigate(next) !== false) event.preventDefault();
  };
  return <nav className="pm-bottom-nav" aria-label="Меню мини-апа">
    <a href="/miniapp/penalties" aria-current={view === 'issue' ? 'page' : undefined} aria-disabled={busy || undefined} onClick={(event) => navigate(event, 'issue')}><Shuffle size={22} /><span>Рулетка</span></a>
    <a href="/miniapp/penalties?view=working" aria-current={view === 'working' ? 'page' : undefined} aria-disabled={busy || undefined} onClick={(event) => navigate(event, 'working')}><span className="pm-nav-icon"><Users size={23} />{Number.isInteger(count) && <span className="pm-nav-count">{count}</span>}</span><span>Отрабатывают сейчас</span></a>
    <a href="/miniapp/platform#/" aria-current={view === 'platform' ? 'page' : undefined} aria-disabled={busy || undefined} onClick={(event) => navigate(event, 'platform')}><LayoutDashboard size={22} /><span>Платформа</span></a>
  </nav>;
}
