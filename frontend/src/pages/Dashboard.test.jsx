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
});
