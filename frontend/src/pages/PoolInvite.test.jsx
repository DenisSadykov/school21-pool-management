import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PoolInvite from './PoolInvite';
import { api, getToken, setSession } from '../api';

jest.mock('../api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
  },
  getToken: jest.fn(),
  setSession: jest.fn(),
}));

function renderInvite(props = {}, initialEntries = ['/join/test-token']) {
  return render(
    <MemoryRouter
      initialEntries={initialEntries}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/join/:token" element={<PoolInvite setUser={jest.fn()} {...props} />} />
        <Route path="/" element={<div>Dashboard</div>} />
        <Route path="/login" element={<div>Login page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PoolInvite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.get.mockResolvedValue({
      pool: { id: 3, name: 'Бассейн 20 июля' },
      invite: { max_uses: 5, expires_at: '2099-01-01T12:00:00' },
    });
  });

  it('loads invite info and asks unauthenticated user to log in', async () => {
    renderInvite({ user: null });

    expect(screen.getByText('Проверяю ссылку...')).toBeInTheDocument();

    expect(await screen.findByText('Приглашение в бассейн «Бассейн 20 июля»')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Войти и присоединиться' })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/api/invites/test-token');
  });

  it('accepts invite for authorized user and updates session', async () => {
    const setUser = jest.fn();
    const user = { id: 8, nick: 'joinme', role: 'volunteer' };
    getToken.mockReturnValue('saved-token');
    api.post.mockResolvedValue({ user });

    renderInvite({ user, setUser });

    expect(await screen.findByRole('button', { name: 'Открыть доступ к бассейну' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Открыть доступ к бассейну' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/invites/test-token/accept', {}));
    expect(setSession).toHaveBeenCalledWith('saved-token', user);
    expect(setUser).toHaveBeenCalledWith(user);
    await waitFor(() => expect(screen.getByText('Dashboard')).toBeInTheDocument());
  });
});
