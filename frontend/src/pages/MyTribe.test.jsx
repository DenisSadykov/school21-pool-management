import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import MyTribe from './MyTribe';
import { api } from '../api';

jest.mock('../api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    del: jest.fn(),
  },
}));

describe('MyTribe meetings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows tribe events returned for a tribe master', async () => {
    api.get.mockResolvedValue({
      tribe: 'Короны',
      rankings: [],
      students: [],
      student_events: [],
      top_students: [],
      tribe_events: [{
        id: 42,
        tribe: 'Короны',
        title: 'Вечерняя встреча',
        date: '2099-09-16',
        time_start: '18:30',
        location: 'Кампус',
      }],
      all_tribe_events: [],
    });

    render(<MyTribe user={{ role: 'tribe_master', tribe: 'Короны' }} />);

    await waitFor(() => expect(screen.getByText('Вечерняя встреча')).toBeInTheDocument());
    expect(screen.getByText('18:30')).toBeInTheDocument();
    expect(screen.getByText('Кампус')).toBeInTheDocument();
  });
});
