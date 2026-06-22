import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Shifts from './pages/Shifts';
import Volunteers from './pages/Volunteers';
import Rewards from './pages/Rewards';
import Admin from './pages/Admin';
import Login from './pages/Login';

import './styles/App.css';
import './styles/theme.css';

function App() {
  const [user, setUser] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  useEffect(() => {
    // Загрузить пользователя из localStorage
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  if (loading) {
    return <div className="loading">Загрузка...</div>;
  }

  if (!user) {
    return <Login setUser={setUser} />;
  }

  return (
    <BrowserRouter>
      <div className="app">
        <Navbar user={user} setUser={setUser} />
        <div className="app-container">
          <Sidebar />
          <main className="main-content">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/shifts" element={<Shifts />} />
              <Route path="/volunteers" element={<Volunteers />} />
              <Route path="/rewards" element={<Rewards />} />
              <Route path="/admin" element={<Admin user={user} />} />
            </Routes>
          </main>
        </div>
      </div>
      <ToastContainer
        position="bottom-right"
        autoClose={3000}
        theme="dark"
      />
    </BrowserRouter>
  );
}

export default App;
