import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Settings from './Settings';
import { api } from '../api';

jest.mock('../api', () => ({
  api: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
  downloadFile: jest.fn(),
  emitPoolsChanged: jest.fn(),
}));

const staff = { id: 2, nick: 'lead', name: 'Тимлид', role: 'team_lead' };
const volunteer = { id: 3, nick: 'helper', name: 'Волонтёр', role: 'volunteer' };

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockImplementation((path) => Promise.resolve(
    path === '/api/users' ? [staff, volunteer] : path === '/api/pools' ? [] : null,
  ));
});

async function renderSettings() {
  const result = render(
    <MemoryRouter>
      <Settings user={{ id: 1, nick: 'admin', role: 'admin' }} />
    </MemoryRouter>,
  );
  await screen.findByText('@lead');
  return result;
}

function section(title) {
  return within(screen.getByRole('heading', { name: title }).closest('section'));
}

function expectVisibleLabel(control, text) {
  expect(control.labels).toHaveLength(1);
  const label = control.labels[0];
  expect(label).toBeVisible();
  expect(within(label).getByText(text, { exact: true, selector: 'span' })).toBeVisible();
}

it('keeps visible, associated labels on pool and staff creation controls', async () => {
  await renderSettings();
  const pools = section('Бассейны');
  expectVisibleLabel(pools.getByLabelText('Название бассейна'), 'Название бассейна');
  expectVisibleLabel(pools.getByLabelText('Дата начала'), 'Дата начала');
  expect(pools.getByLabelText('Дата начала')).toHaveAttribute('type', 'date');

  const users = section('Добавить администратора / тимлида');
  for (const text of ['Ник', 'Имя', 'Ник Telegram', 'Роль', 'Пароль']) {
    expectVisibleLabel(users.getByLabelText(text, { exact: true }), text);
  }
  expect(users.getByLabelText('Пароль')).toHaveAttribute('type', 'password');
  fireEvent.change(users.getByLabelText('Ник', { exact: true }), { target: { value: 'new_lead' } });
  expectVisibleLabel(users.getByLabelText('Ник', { exact: true }), 'Ник');
});

it('submits the labeled pool fields with the existing date payload', async () => {
  await renderSettings();
  api.post.mockResolvedValue({ id: 4, name: 'Бассейн октября', start_date: '2026-10-20' });
  const pools = section('Бассейны');
  fireEvent.change(pools.getByLabelText('Название бассейна'), { target: { value: 'Бассейн октября' } });
  fireEvent.change(pools.getByLabelText('Дата начала'), { target: { value: '2026-10-20' } });
  fireEvent.click(pools.getByRole('button', { name: 'Создать' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/pools', {
    name: 'Бассейн октября', start_date: '2026-10-20',
  }));
  expect(await screen.findByText('Бассейн добавлен')).toBeInTheDocument();
});

it('preserves the existing optional password behavior when creating a staff user', async () => {
  await renderSettings();
  api.post.mockResolvedValue({ id: 5, nick: 'new_admin', role: 'admin' });
  const users = section('Добавить администратора / тимлида');
  fireEvent.change(users.getByLabelText('Ник', { exact: true }), { target: { value: 'new_admin' } });
  fireEvent.change(users.getByLabelText('Роль'), { target: { value: 'admin' } });
  expect(users.getByLabelText('Пароль')).not.toBeRequired();
  fireEvent.click(users.getByRole('button', { name: 'Добавить', exact: true }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/users', {
    nick: 'new_admin', name: '', telegram: '', role: 'admin', password: '',
  }));
  expect(await screen.findByText('@new_admin добавлен')).toBeInTheDocument();
});

it('labels manual volunteer creation and staff edit fields', async () => {
  await renderSettings();
  const manual = section('Добавить волонтёров в систему');
  for (const text of ['Имя', 'Ник', 'Ник Telegram']) {
    expectVisibleLabel(manual.getByLabelText(text, { exact: true }), text);
  }

  const users = section('Добавить администратора / тимлида');
  const row = screen.getByText('@lead').closest('.user-row');
  fireEvent.click(users.getByTitle('Редактировать'));
  for (const text of ['Ник', 'Имя', 'Ник Telegram', 'Новый пароль']) {
    expectVisibleLabel(within(row).getByLabelText(text, { exact: true }), text);
  }
  expect(within(row).getByLabelText('Новый пароль')).toHaveAttribute('type', 'password');
});

it('labels volunteer inline edit fields after opening row actions', async () => {
  await renderSettings();
  fireEvent.click(screen.getByRole('button', { name: 'Действия для @helper' }));
  fireEvent.click(await screen.findByText('Редактировать', { exact: true }));
  const table = within(screen.getByRole('table'));
  for (const text of ['Имя', 'Ник', 'Ник Telegram']) {
    expectVisibleLabel(table.getByLabelText(text, { exact: true }), text);
  }
});
