import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Profile from './Profile';
import { MemoryRouter } from 'react-router-dom';
import { api, getToken, setSession } from '../api';

jest.mock('../api', () => ({
  api: { patch: jest.fn(), upload: jest.fn() },
  getToken: jest.fn(),
  setSession: jest.fn(),
}));
jest.mock('../components/PersonalStatistics', () => () => null);
jest.mock('../components/PasswordChange', () => () => null);

const user = { id: 1, nick: 'lead', name: 'Тимлид', telegram: '@lead', role: 'team_lead' };

beforeEach(() => {
  jest.clearAllMocks();
  getToken.mockReturnValue('saved-token');
});

function renderDetails() {
  const setUser = jest.fn();
  const result = render(<MemoryRouter><Profile user={user} setUser={setUser} /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Личные данные' }));
  return { ...result, setUser };
}

it('announces a successful save as a success status and updates the session', async () => {
  const updated = { ...user, name: 'Новое имя' };
  api.patch.mockResolvedValue(updated);
  const { setUser } = renderDetails();
  fireEvent.change(screen.getByLabelText('Имя'), { target: { value: updated.name } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить', exact: true }));
  const status = await screen.findByRole('status');
  expect(status).toHaveTextContent('Личные данные сохранены.');
  expect(status).toHaveClass('alert', 'success');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(setUser).toHaveBeenCalledWith(updated);
  expect(setSession).toHaveBeenCalledWith('saved-token', updated);
});

it('announces a failed save as an error alert and preserves the draft', async () => {
  api.patch.mockRejectedValue(new Error('Ник уже занят'));
  const { setUser } = renderDetails();
  fireEvent.change(screen.getByLabelText('Ник'), { target: { value: 'occupied' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить', exact: true }));
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('Ошибка: Ник уже занят');
  expect(alert).toHaveClass('alert', 'error');
  expect(alert).not.toHaveClass('success');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Ник')).toHaveValue('occupied');
  expect(setUser).not.toHaveBeenCalled();
  expect(setSession).not.toHaveBeenCalled();
});

it.each([
  ['success', 'status', 'Фото профиля обновлено.'],
  ['error', 'alert', 'Ошибка загрузки фото: Файл слишком большой'],
])('uses %s feedback for avatar uploads', async (type, role, text) => {
  if (type === 'success') {
    api.upload.mockResolvedValue({ user });
  } else {
    api.upload.mockRejectedValue(new Error('Файл слишком большой'));
  }
  const { container, setUser } = renderDetails();
  const file = new File(['image'], 'avatar.png', { type: 'image/png' });
  fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [file] } });
  const feedback = await screen.findByRole(role);
  expect(feedback).toHaveTextContent(text);
  expect(feedback).toHaveClass('alert', type);
  expect(feedback).not.toHaveClass(type === 'success' ? 'error' : 'success');
  expect(api.upload).toHaveBeenCalledWith('/api/me/avatar', expect.any(FormData));
  expect(api.upload.mock.calls[0][1].get('file')).toBe(file);
  if (type === 'success') {
    expect(setUser).toHaveBeenCalledWith(user);
    expect(setSession).toHaveBeenCalledWith('saved-token', user);
  } else {
    expect(setUser).not.toHaveBeenCalled();
    expect(setSession).not.toHaveBeenCalled();
  }
});

it('clears stale success feedback on retry and switches to an error if that save fails', async () => {
  let rejectRetry;
  api.patch.mockResolvedValueOnce(user).mockImplementationOnce(() => new Promise((resolve, reject) => {
    rejectRetry = reject;
  }));
  renderDetails();
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить', exact: true }));
  await screen.findByRole('status');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Сохранить', exact: true })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить', exact: true }));
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Сохраняем...' })).toBeDisabled();
  rejectRetry(new Error('Сервер недоступен'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Ошибка: Сервер недоступен');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
