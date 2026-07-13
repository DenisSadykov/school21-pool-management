import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import Loader from './components/Loader';
import Dashboard from './pages/Dashboard';
import Schedule from './pages/Schedule';
import Students from './pages/Students';
import Volunteers from './pages/Volunteers';
import Penalties from './pages/Penalties';
import Manage from './pages/Manage';
import Settings from './pages/Settings';
import Admin from './pages/Admin';
import MyTribe from './pages/MyTribe';
import GroupReviews from './pages/GroupReviews';
import Login from './pages/Login';
import ExamBrief from './pages/ExamBrief';
import Notifications from './pages/Notifications';
import Profile from './pages/Profile';
import PoolInvite from './pages/PoolInvite';
import { api, getToken, getUser, isPoolsChangedStorageEvent, POOLS_CHANGED_EVENT, setSession } from './api';

import './styles/App.css';
import './styles/theme.css';

const ACCENT_SCHEMES = new Set(['cobalt', 'jade', 'amber']);

function App() {
  const [user, setUser] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = React.useState(false);
  const [poolContextVersion, setPoolContextVersion] = React.useState(0);

  useEffect(() => {
    let alive = true;
    const root = document.documentElement;
    root.setAttribute('data-theme', 'light');

    const params = new URLSearchParams(window.location.search);
    const accentFromUrl = params.get('accent');
    const accentFromStorage = localStorage.getItem('uiAccentScheme');
    const accentScheme = ACCENT_SCHEMES.has(accentFromUrl)
      ? accentFromUrl
      : (ACCENT_SCHEMES.has(accentFromStorage) ? accentFromStorage : 'cobalt');

    root.setAttribute('data-accent-scheme', accentScheme);
    localStorage.setItem('uiAccentScheme', accentScheme);

    const sessionUser = getUser();
    setUser(sessionUser);

    const syncUser = async () => {
      if (!getToken()) {
        if (alive) setLoading(false);
        return;
      }
      try {
        const previousUser = getUser();
        const freshUser = await api.get('/api/auth/me');
        if (!alive) return;
        setSession(getToken(), freshUser);
        setUser(freshUser);
        return !previousUser
          || previousUser.active_pool_id !== freshUser.active_pool_id
          || previousUser.role !== freshUser.role
          || previousUser.tribe !== freshUser.tribe;
      } catch (error) {
        if (!alive) return;
        setUser(getUser());
      } finally {
        if (alive) setLoading(false);
      }
    };

    const handlePoolsChanged = async () => {
      await syncUser();
      if (alive) setPoolContextVersion((version) => version + 1);
    };

    const handleStorage = (event) => {
      if (isPoolsChangedStorageEvent(event)) handlePoolsChanged();
    };

    const pollContext = async () => {
      const changed = await syncUser();
      if (alive && changed) setPoolContextVersion((version) => version + 1);
    };

    syncUser();
    const pollTimer = window.setInterval(pollContext, 30000);
    window.addEventListener(POOLS_CHANGED_EVENT, handlePoolsChanged);
    window.addEventListener('storage', handleStorage);
    return () => {
      alive = false;
      window.clearInterval(pollTimer);
      window.removeEventListener(POOLS_CHANGED_EVENT, handlePoolsChanged);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  return (
    <BrowserRouter>
      <AppRoutes
        user={user}
        setUser={setUser}
        loading={loading}
        mobileSidebarOpen={mobileSidebarOpen}
        setMobileSidebarOpen={setMobileSidebarOpen}
        poolContextVersion={poolContextVersion}
      />
      <ToastContainer position="bottom-right" autoClose={3000} theme="light" />
    </BrowserRouter>
  );
}

function AppRoutes({ user, setUser, loading, mobileSidebarOpen, setMobileSidebarOpen, poolContextVersion }) {
  if (loading) {
    return <Loader text="Загрузка..." fullscreen />;
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login setUser={setUser} />} />
        <Route path="/join/:token" element={<PoolInvite user={null} setUser={setUser} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  const isStaff = user.role === 'team_lead' || user.role === 'admin';
  const canUseTribe = user.role === 'tribe_master' || isStaff;
  const canUseGroupReviews = isStaff;

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/join/:token" element={<PoolInvite user={user} setUser={setUser} />} />
      <Route
        path="*"
        element={(
          <div className="app">
            <Navbar
              user={user}
              setUser={setUser}
              mobileSidebarOpen={mobileSidebarOpen}
              onMobileMenuToggle={() => setMobileSidebarOpen((prev) => !prev)}
            />
            <div className="app-container">
              <Sidebar
                user={user}
                mobileOpen={mobileSidebarOpen}
                onMobileClose={() => setMobileSidebarOpen(false)}
              />
              {mobileSidebarOpen && (
                <button
                  type="button"
                  className="mobile-sidebar-backdrop"
                  aria-label="Закрыть меню"
                  onClick={() => setMobileSidebarOpen(false)}
                />
              )}
              <main className="main-content" key={poolContextVersion}>
                <Routes>
                  <Route path="/" element={<Dashboard user={user} />} />
                  <Route path="/schedule" element={<Schedule user={user} />} />
                  <Route path="/penalties" element={<Penalties user={user} />} />
                  <Route path="/students" element={<Students user={user} />} />
                  <Route path="/volunteers" element={<Volunteers user={user} />} />
                  <Route path="/profile" element={<Profile user={user} setUser={setUser} />} />
                  <Route path="/exam-brief" element={<ExamBrief />} />
                  {canUseTribe && <Route path="/my-tribe" element={<MyTribe user={user} />} />}
                  {canUseGroupReviews && <Route path="/group-reviews" element={<GroupReviews user={user} />} />}
                  {isStaff && <Route path="/manage" element={<Manage user={user} />} />}
                  {isStaff && <Route path="/notifications" element={<Notifications user={user} />} />}
                  {isStaff && <Route path="/settings" element={<Settings user={user} />} />}
                  {isStaff && <Route path="/admin" element={<Admin user={user} />} />}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </main>
            </div>
          </div>
        )}
      />
    </Routes>
  );
}

export default App;
