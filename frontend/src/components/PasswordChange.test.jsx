import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PasswordChange from './PasswordChange';
import { api, clearSession, setSession } from '../api';

jest.mock('../api', () => ({ api: { post: jest.fn() }, clearSession: jest.fn(), setSession: jest.fn() }));
const user = { id: 2, nick: 'first_login', must_change_password: true };
beforeEach(() => jest.clearAllMocks());

test('saves the new session after mandatory password change', async () => {
  const updated = { ...user, must_change_password: false };
  api.post.mockResolvedValue({ token: 'new-token', user: updated });
  const setUser = jest.fn();
  render(<PasswordChange user={user} setUser={setUser} required />);
  fireEvent.change(screen.getByLabelText('Текущий пароль'), { target: { value: 'first_login' } });
  fireEvent.change(screen.getByLabelText('Новый пароль'), { target: { value: 'personal123' } });
  fireEvent.change(screen.getByLabelText('Повторите новый пароль'), { target: { value: 'personal123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить пароль' }));
  await waitFor(() => expect(setSession).toHaveBeenCalledWith('new-token', updated));
  expect(setUser).toHaveBeenCalledWith(updated);
  expect(screen.getByLabelText('Текущий пароль')).toHaveValue('');
});

test('does not send a mismatched password and allows logout', () => {
  const setUser = jest.fn();
  render(<PasswordChange user={user} setUser={setUser} required />);
  fireEvent.change(screen.getByLabelText('Текущий пароль'), { target: { value: 'first_login' } });
  fireEvent.change(screen.getByLabelText('Новый пароль'), { target: { value: 'personal123' } });
  fireEvent.change(screen.getByLabelText('Повторите новый пароль'), { target: { value: 'different123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить пароль' }));
  expect(screen.getByRole('status')).toHaveTextContent('Пароли не совпадают');
  expect(api.post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Выйти' }));
  expect(clearSession).toHaveBeenCalled();
  expect(setUser).toHaveBeenCalledWith(null);
});
