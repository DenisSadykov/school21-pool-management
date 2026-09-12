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
jest.mock('./pages/Login', () => () => <div>Вход</div>);
jest.mock('./pages/ExamBrief', () => () => null);
jest.mock('./pages/Notifications', () => () => null);
jest.mock('./pages/Profile', () => () => null);
jest.mock('./pages/PoolInvite', () => () => null);
jest.mock('react-toastify', () => ({ ToastContainer: () => null }));

const cachedUser = { id: 7, nick: 'tester', role: 'volunteer' };

describe('App session refresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getToken.mockReturnValue('saved-token');
    getUser.mockReturnValue(cachedUser);
  });

  it('keeps the cached session when the API is temporarily unavailable', async () => {
    api.get.mockRejectedValue(new Error('Сервер не отвечает'));

    render(<App />);

    await waitFor(() => expect(screen.getByText('Дашборд')).toBeInTheDocument());
    expect(clearSession).not.toHaveBeenCalled();
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
});
