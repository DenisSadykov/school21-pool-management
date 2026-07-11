import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, getToken, setSession } from '../api';
import Loader from '../components/Loader';
import '../styles/Login.css';

function PoolInvite({ user, setUser }) {
  const { token } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [inviteInfo, setInviteInfo] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await api.get(`/api/invites/${token}`);
        if (!alive) return;
        setInviteInfo(data);
      } catch (err) {
        if (!alive) return;
        setError(err.message);
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    return () => {
      alive = false;
    };
  }, [token]);

  const acceptInvite = async () => {
    setSubmitting(true);
    setError('');
    try {
      const data = await api.post(`/api/invites/${token}/accept`, {});
      if (data?.user && getToken()) {
        setSession(getToken(), data.user);
        setUser(data.user);
      }
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="login-intro">
          <h1>Доступ к бассейну</h1>
          {inviteInfo?.pool?.name && (
            <>
              <p className="text-muted">Приглашение в бассейн «{inviteInfo.pool.name}»</p>
              {(inviteInfo?.invite?.max_uses || inviteInfo?.invite?.expires_at) && (
                <p className="text-muted">
                  {inviteInfo?.invite?.max_uses ? `Лимит входов: ${inviteInfo.invite.max_uses}. ` : ''}
                  {inviteInfo?.invite?.expires_at ? `Действует до: ${new Date(inviteInfo.invite.expires_at).toLocaleString('ru-RU')}` : ''}
                </p>
              )}
            </>
          )}
        </div>

        {loading ? (
          <Loader text="Проверяю ссылку..." compact />
        ) : error ? (
          <>
            <div className="error-message">{error}</div>
            <Link to={user ? '/' : '/login'} className="btn-login" style={{ textDecoration: 'none', textAlign: 'center' }}>
              {user ? 'На главную' : 'Ко входу'}
            </Link>
          </>
        ) : !user ? (
          <>
            <p className="text-muted">
              Войди в свой аккаунт, чтобы получить доступ к этому бассейну.
            </p>
            <button
              type="button"
              className="btn-login"
              onClick={() => navigate('/login', { state: { from: location.pathname } })}
            >
              Войти и присоединиться
            </button>
          </>
        ) : (
          <>
            <p className="text-muted">
              После подтверждения у тебя появится доступ к этому бассейну на платформе.
            </p>
            {error && <div className="error-message">{error}</div>}
            <button type="button" className="btn-login" onClick={acceptInvite} disabled={submitting}>
              {submitting ? 'Подключаю…' : 'Открыть доступ к бассейну'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default PoolInvite;
