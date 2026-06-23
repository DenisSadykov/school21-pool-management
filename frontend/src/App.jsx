import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Schedule from './pages/Schedule';
import Students from './pages/Students';
import Volunteers from './pages/Volunteers';
import Penalties from './pages/Penalties';
import Manage from './pages/Manage';
import Admin from './pages/Admin';
import MyTribe from './pages/MyTribe';
import GroupReviews from './pages/GroupReviews';
import Login from './pages/Login';
import { getUser } from './api';

import './styles/App.css';
import './styles/theme.css';

function App() {
  const [user, setUser] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  useEffect(() => {
    setUser(getUser());
    setLoading(false);
  }, []);

  if (loading) {
    return <div className="loading">Загрузка...</div>;
  }

  if (!user) {
    return <Login setUser={setUser} />;
  }

  const isStaff = user.role === 'team_lead' || user.role === 'admin';
  const canUseTribe = user.role === 'tribe_master' || user.role === 'admin';
  const canUseGroupReviews = isStaff;

  return (
    <BrowserRouter>
      <div className="app">
        <Navbar user={user} setUser={setUser} />
        <div className="app-container">
          <Sidebar user={user} />
          <main className="main-content">
            <Routes>
              <Route path="/" element={<Dashboard user={user} />} />
              <Route path="/schedule" element={<Schedule user={user} />} />
              <Route path="/penalties" element={<Penalties user={user} />} />
              <Route path="/students" element={<Students user={user} />} />
              <Route path="/volunteers" element={<Volunteers user={user} />} />
              {canUseTribe && <Route path="/my-tribe" element={<MyTribe user={user} />} />}
              {canUseGroupReviews && <Route path="/group-reviews" element={<GroupReviews user={user} />} />}
              {isStaff && <Route path="/manage" element={<Manage user={user} />} />}
              {isStaff && <Route path="/admin" element={<Admin user={user} />} />}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </div>
      <ToastContainer position="bottom-right" autoClose={3000} theme="dark" />
    </BrowserRouter>
  );
}

export default App;
