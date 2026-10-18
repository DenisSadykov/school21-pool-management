import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { api, clearSession, getToken, getUser } from './api';

jest.mock('./api', () => ({
  api: { get: jest.fn() },
  clearSession: jest.fn(),
  getToken: jest.fn(),
  getUser: jest.fn(),
  isPoolsChangedStorageEvent: jest.fn(() => false),
  POOLS_CHANGED_EVENT: 'app:pools-changed',
  SESSION_INVALIDATED_EVENT: 'app:session-invalidated',
  setSession: jest.fn(),
}));

jest.mock('./components/Navbar', () => () => <div>Навбар</div>);
jest.mock('./components/Sidebar', () => () => <div>Навигация</div>);
jest.mock('./components/Loader', () => ({ text }) => <div>{text}</div>);
jest.mock('./components/ThemeToggle', () => () => null);
jest.mock('./pages/Dashboard', () => () => <div>Дашборд</div>);
jest.mock('./pages/Schedule', () => () => null);
jest.mock('./pages/Students', () => () => null);
jest.mock('./pages/Volunteers', () => () => null);
jest.mock('./pages/Penalties', () => () => null);
jest.mock('./pages/Manage', () => () => null);
jest.mock('./pages/Settings', () => () => null);
jest.mock('./pages/Admin', () => () => null);
jest.mock('./pages/MyTribe', () => () => null);
jest.mock('./pages/TribeScripts', () => () => null);
jest.mock('./pages/GroupReviews', () => () => null);
jest.mock('./pages/Login', () => ({ __esModule: true, default: () => <div>Вход</div>,
  safeInternalPath: jest.requireActual('./pages/Login').safeInternalPath }));
jest.mock('./pages/ExamBrief', () => () => null);
jest.mock('./pages/Notifications', () => () => null);
jest.mock('./pages/Profile', () => () => null);
jest.mock('./pages/PoolInvite', () => () => null);
jest.mock('react-toastify', () => ({ ToastContainer: () => null }));

const cachedUser = { id: 7, nick: 'tester', role: 'volunteer' };

describe('App session refresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState(null, '', '/');
    getToken.mockReturnValue('saved-token');
    getUser.mockReturnValue(cachedUser);
  });

  it('keeps the cached session when the API is temporarily unavailable', async () => {
    api.get.mockRejectedValue(new Error('Сервер не отвечает'));

    render(<App />);

    await waitFor(() => expect(screen.getByText('Дашборд')).toBeInTheDocument());
    expect(clearSession).not.toHaveBeenCalled();
  });

  it('blocks the normal interface until the initial password is changed', async () => {
    const initial = { ...cachedUser, must_change_password: true };
    getUser.mockReturnValue(initial);
    api.get.mockResolvedValue(initial);
    render(<App />);
    await waitFor(() => expect(screen.getByText('Задайте свой пароль')).toBeInTheDocument());
    expect(screen.queryByText('Дашборд')).not.toBeInTheDocument();
    expect(screen.queryByText('Навигация')).not.toBeInTheDocument();
  });

  it('does not delete the session when the startup safety timer expires', async () => {
    jest.useFakeTimers();
    api.get.mockReturnValue(new Promise(() => {}));

    render(<App />);
    act(() => jest.advanceTimersByTime(16000));

    expect(screen.getByText('Дашборд')).toBeInTheDocument();
    expect(clearSession).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('opens the real platform in Telegram with hash routing and a return menu', async () => {
    window.history.replaceState(null, '', '/miniapp/platform#/');
    api.get.mockResolvedValue(cachedUser);
    render(<App />);
    expect(await screen.findByText('Дашборд')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Платформа' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Рулетка' })).toHaveAttribute('href', '/miniapp/penalties');
    expect(screen.getByRole('link', { name: /Отрабатывают сейчас/ })).toHaveAttribute('href', '/miniapp/penalties?view=working');
    expect(window.location.pathname).toBe('/miniapp/platform');
  });

  it('does not bypass platform login when opened in the miniapp', async () => {
    window.history.replaceState(null, '', '/miniapp/platform#/');
    getToken.mockReturnValue(null); getUser.mockReturnValue(null);
    render(<App />);
    expect(await screen.findByText('Вход')).toBeInTheDocument();
    expect(screen.queryByText('Дашборд')).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/miniapp/platform');
    expect(window.location.hash).toBe('#/login');
  });
});
