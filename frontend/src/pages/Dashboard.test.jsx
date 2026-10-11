import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './Dashboard';
import { api } from '../api';
import { moscowTodayIso } from '../utils/date';

jest.mock('../api', () => ({
  api: {
    get: jest.fn(),
  },
}));

const dashboardPayload = {
  tribe: {
    tribe: 'Ленты',
    students_count: 49,
    events_total: 0,
    entertainment_events: 0,
    education_events: 0,
    rank: 2,
    next_events: [],
    top_students: [],
  },
  telegram: { linked: true },
  dashboard_notes: [],
  pool_responsibles: [],
};

it('shows direct Telegram buttons beside tomorrow volunteers, without raw Telegram handles', async () => {
  api.get.mockResolvedValue({
    ...dashboardPayload,
    role: 'team_lead',
    tomorrow: '2026-10-12',
    tomorrow_blocks: [{
      id: 1, date: '2026-10-12', time_start: '09:00', time_end: '19:00',
      volunteers: [
        { id: 1, nick: 'aracelio', telegram: '@helene_sleepymood' },
        { id: 2, nick: 'combinef', telegram: 'https://t.me/code2py' },
        { id: 3, nick: 'without_telegram', telegram: '' },
        { id: 4, nick: 'invalid_telegram', telegram: 'not a username' },
      ],
    }],
  });
  render(<MemoryRouter><Dashboard user={{ role: 'team_lead' }} /></MemoryRouter>);
  expect(await screen.findByRole('link', { name: 'Написать @aracelio в Telegram' }))
    .toHaveAttribute('href', 'https://t.me/helene_sleepymood');
  expect(screen.getByText('@aracelio').closest('.dashboard-shift-people')).toHaveClass('has-columns');
  expect(screen.getByRole('link', { name: 'Написать @combinef в Telegram' }))
    .toHaveAttribute('href', 'https://t.me/code2py');
  expect(screen.queryByText(/tg:/)).not.toBeInTheDocument();
  expect(screen.getByText('@without_telegram')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Написать @without_telegram в Telegram' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Написать @invalid_telegram в Telegram' })).not.toBeInTheDocument();
});

describe('Tribe-master dashboard scripts reminder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.get.mockImplementation((path) => {
      if (path === '/api/dashboard') return Promise.resolve(dashboardPayload);
      if (path === '/api/tribe-scripts') {
        return Promise.resolve({
          templates: [
            { id: 'today-unsent', title: 'Приветствие', recommended_date: moscowTodayIso(), sent: false },
            { id: 'today-sent', title: 'Уже отправлено', recommended_date: moscowTodayIso(), sent: true },
            { id: 'another-day', title: 'Не сегодня', recommended_date: '2099-01-01', sent: false },
          ],
        });
      }
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    });
  });

  it('shows only unsent messages due today and links to the today filter', async () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Dashboard user={{ role: 'tribe_master' }} />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Сегодня нужно отправить 1 сообщение')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Работа с трайбом' })).toBeInTheDocument();
    expect(screen.getByText('Ближайшие встречи')).toBeInTheDocument();
    expect(screen.getByText('Приветствие')).toBeInTheDocument();
    expect(screen.queryByText('Уже отправлено')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Открыть скрипты' })).toHaveAttribute('href', '/tribe-scripts?today=1');
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/tribe-scripts'));
  });

  it('shows tribe work to an assistant without loading master scripts', async () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Dashboard user={{ role: 'tribe_assistant' }} />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Работа с трайбом' })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/api/dashboard');
    expect(api.get).not.toHaveBeenCalledWith('/api/tribe-scripts');
  });
});
