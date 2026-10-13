import React from 'react';
import { render, screen } from '@testing-library/react';
import Admin from './Admin';
import { api } from '../api';

jest.mock('../api', () => ({ api: { get: jest.fn(), post: jest.fn() }, downloadFile: jest.fn(), setSession: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

it('shows actual PostgreSQL status, not an Excel backup button', async () => {
  api.get.mockImplementation(path => Promise.resolve(path.includes('backup-status')
    ? { provider: 'postgresql', status: 'ok', today_exists: true, manual_available: false,
        latest_at: '2026-10-13T08:00:00+00:00' } : []));
  render(<Admin user={{ role: 'admin' }} setUser={jest.fn()} />);
  expect(await screen.findByText('Проверен сегодня')).toBeInTheDocument();
  expect(screen.getByText('Полный PostgreSQL')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Создать.*резерв/ })).not.toBeInTheDocument();
  expect(screen.getByText(/состояние копии на компьютере здесь не отслеживается/)).toBeInTheDocument();
});

it('does not report no backup today when metadata is unavailable', async () => {
  api.get.mockImplementation(path => path.includes('backup-status')
    ? Promise.reject(new Error('unavailable')) : Promise.resolve([]));
  render(<Admin user={{ role: 'team_lead' }} setUser={jest.fn()} />);
  expect(await screen.findByText('Не удалось проверить')).toBeInTheDocument();
  expect(screen.queryByText('ещё не создан сегодня')).not.toBeInTheDocument();
});
