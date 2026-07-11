import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Login from './Login';
import { api, setSession } from '../api';

jest.mock('../api', () => ({
  api: {
    post: jest.fn(),
  },
  setSession: jest.fn(),
}));

function renderLogin(setUser = jest.fn(), initialEntries = ['/login']) {
  return render(
    <MemoryRouter
      initialEntries={initialEntries}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/login" element={<Login setUser={setUser} />} />
        <Route path="/" element={<div>Главная</div>} />
        <Route path="/students" element={<div>Главная</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Login', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  it('shows password field only for staff roles', () => {
    renderLogin();

    expect(screen.queryByLabelText('Пароль')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Роль'), { target: { value: 'team_lead' } });
    expect(screen.getByLabelText('Пароль')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Роль'), { target: { value: 'volunteer' } });
    expect(screen.queryByLabelText('Пароль')).not.toBeInTheDocument();
  });

  it('submits credentials, saves session and redirects back', async () => {
    const setUser = jest.fn();
    const user = { id: 7, nick: 'odessabu', role: 'admin' };
    api.post.mockResolvedValue({ token: 'secret-token', user });

    renderLogin(setUser, [{ pathname: '/login', state: { from: '/students' } }]);

    fireEvent.change(screen.getByLabelText('Роль'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('Твой ник'), { target: { value: ' odessabu ' } });
    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'pass1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/auth/login', {
        nick: 'odessabu',
        password: 'pass1234',
      });
    });
    expect(setSession).toHaveBeenCalledWith('secret-token', user);
    expect(setUser).toHaveBeenCalledWith(user);
    await waitFor(() => expect(screen.getByText('Главная')).toBeInTheDocument());
  });
});
