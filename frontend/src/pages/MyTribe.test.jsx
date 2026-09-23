import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

  it('allows a tribe master to edit a meeting', async () => {
    api.get.mockResolvedValue({
      tribe: 'Короны',
      rankings: [],
      students: [],
      student_events: [],
      top_students: [],
      tribe_events: [{
        id: 42,
        tribe: 'Короны',
        title: 'Старая встреча',
        date: '2099-09-16',
        time_start: '18:30',
        location: 'Кампус',
        comment: '',
      }],
      all_tribe_events: [],
    });
    api.patch.mockResolvedValue({ id: 42 });

    render(<MyTribe user={{ role: 'tribe_master', tribe: 'Короны' }} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Редактировать встречу Старая встреча' }));
    const dialog = screen.getByRole('dialog', { name: 'Редактировать встречу' });
    fireEvent.change(within(dialog).getByLabelText('Название'), { target: { value: 'Новая встреча' } });
    fireEvent.change(within(dialog).getByLabelText('Время'), { target: { value: '19:00' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/api/tribe-events/42', {
      title: 'Новая встреча',
      event_date: '2099-09-16',
      time_start: '19:00',
      location: 'Кампус',
      comment: '',
    }));
  });

  it('keeps status control in the status column and only delete in more', async () => {
    api.get.mockResolvedValue({
      tribe: '',
      rankings: [],
      students: [],
      student_events: [{
        id: 17,
        student_nick: 'peer',
        student_name: 'Peer',
        student_tribe: 'Короны',
        type: 'education',
        date: '2099-09-23',
        points: 0,
        status: 'pending',
      }],
      top_students: [],
      tribe_events: [],
      all_tribe_events: [],
    });

    render(<MyTribe user={{ role: 'team_lead' }} />);

    const statusSelect = await screen.findByRole('combobox', { name: 'Статус мероприятия peer' });
    const row = statusSelect.closest('.student-event-row');
    const cells = row.querySelectorAll(':scope > div');

    expect(cells[cells.length - 2]).toContainElement(statusSelect);
    expect(cells[cells.length - 1].querySelector('select')).toBeNull();
    expect(within(cells[cells.length - 1]).getByTitle('Удалить')).toBeInTheDocument();
  });
});
