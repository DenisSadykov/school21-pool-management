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

it('lets staff set and reset a tribe assistant event count', async () => {
  api.get.mockImplementation((path) => {
    if (path === '/api/pools/active') return Promise.resolve({ id: 13, name: 'Pool' });
    if (path === '/api/tribes?pool_id=13') return Promise.resolve([{ name: 'Олени' }]);
    if (path === '/api/volunteers?pool_id=13') return Promise.resolve([{
      id: 53, nick: 'assistant', name: 'Вика', role: 'tribe_assistant', tribe: 'Олени',
      has_confession: false, shifts_count: 0, coins: 240, tribe_event_count: 8,
      tribe_event_count_override: 3, coin_breakdown: [],
    }]);
    return Promise.reject(new Error(`Unexpected path: ${path}`));
  });
  api.patch.mockResolvedValue({});

  render(<MemoryRouter><Volunteers user={{ role: 'admin' }} /></MemoryRouter>);

  fireEvent.click(await screen.findByRole('button', { name: 'Управление @assistant' }));
  fireEvent.change(screen.getByRole('spinbutton', { name: /Трайб-мероприятия/ }), { target: { value: '3' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/api/volunteers/53', {
    pool_id: 13, tribe_event_count_override: 3,
  }));
  fireEvent.click(screen.getByRole('button', { name: 'Считать автоматически по мероприятиям трайба' }));
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/api/volunteers/53', {
    pool_id: 13, tribe_event_count_override: null,
  }));
});
