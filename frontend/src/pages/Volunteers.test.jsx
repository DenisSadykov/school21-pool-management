import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Volunteers from './Volunteers';
import { api } from '../api';

jest.mock('../api', () => ({
  api: { get: jest.fn(), patch: jest.fn() },
  downloadFile: jest.fn(),
}));

it('lets staff credit a team lead for confession without changing their role', async () => {
  api.get.mockImplementation((path) => {
    if (path === '/api/pools/active') return Promise.resolve({ id: 13, name: 'Pool' });
    if (path === '/api/tribes?pool_id=13') return Promise.resolve([]);
    if (path === '/api/volunteers?pool_id=13') {
      return Promise.resolve([{
        id: 58,
        nick: 'lead',
        name: 'Тимлид',
        role: 'team_lead',
        has_confession: false,
        shifts_count: 0,
        coins: 450,
        coin_breakdown: [],
      }]);
    }
    return Promise.reject(new Error(`Unexpected path: ${path}`));
  });
  api.patch.mockResolvedValue({});

  render(
    <MemoryRouter>
      <Volunteers user={{ role: 'admin' }} />
    </MemoryRouter>,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Управление @lead' }));
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Исповедь' }));

  await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/api/volunteers/58', {
    pool_id: 13,
    has_confession: true,
  }));
});
