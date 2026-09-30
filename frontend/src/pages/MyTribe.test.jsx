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

  it('shows past meetings and allows a past meeting with the assistant marked present', async () => {
    api.get.mockResolvedValue({
      tribe: 'Олени', rankings: [], students: [], student_events: [], top_students: [],
      assistants_by_tribe: { Олени: ['picklicy'] },
      tribe_events: [
        { id: 42, tribe: 'Олени', title: 'Старая встреча', date: '2020-09-16', assistant_attending: true },
        { id: 43, tribe: 'Олени', title: 'Будущая встреча', date: '2099-09-16', assistant_attending: false },
      ],
      all_tribe_events: [],
    });
    api.post.mockResolvedValue({ id: 44 });
    api.patch.mockResolvedValue({ id: 42 });

    render(<MyTribe user={{ role: 'tribe_master', tribe: 'Олени' }} />);

    expect(await screen.findByText('Старая встреча')).toBeInTheDocument();
    expect(screen.getByText('Будущая встреча')).toBeInTheDocument();
    expect(screen.getByText('Прошедшие')).toBeInTheDocument();
    expect(screen.getByText('Предстоящие')).toBeInTheDocument();
    expect(screen.getByText('Помощник был')).toBeInTheDocument();

    const createForm = screen.getByText('Добавить встречу').closest('form');
    fireEvent.change(within(createForm).getByLabelText('Название'), { target: { value: 'Вчерашняя встреча' } });
    fireEvent.change(within(createForm).getByLabelText('Дата'), { target: { value: '2020-09-17' } });
    fireEvent.click(within(createForm).getByRole('checkbox', { name: /Помощник трайб-мастера @picklicy/ }));
    fireEvent.click(within(createForm).getByRole('button', { name: 'Добавить встречу' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/tribe-events', expect.objectContaining({
      tribe: 'Олени', title: 'Вчерашняя встреча', event_date: '2020-09-17', assistant_attending: true,
    })));

    fireEvent.click(screen.getByRole('button', { name: 'Редактировать встречу Старая встреча' }));
    const dialog = screen.getByRole('dialog', { name: 'Редактировать встречу' });
    const attendance = within(dialog).getByRole('checkbox', { name: /Помощник трайб-мастера @picklicy/ });
    expect(attendance).toBeChecked();
    fireEvent.click(attendance);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/api/tribe-events/42', expect.objectContaining({
      assistant_attending: false,
    })));
  });

  it('shows an assistant whether their participation was marked', async () => {
    api.get.mockResolvedValue({
      tribe: 'Олени', rankings: [], students: [], student_events: [], top_students: [],
      assistants_by_tribe: { Олени: ['picklicy'] },
      tribe_events: [
        { id: 42, tribe: 'Олени', title: 'Была', date: '2020-09-16', assistant_attending: true },
        { id: 43, tribe: 'Олени', title: 'Не отмечена', date: '2099-09-16', assistant_attending: false },
      ],
      all_tribe_events: [],
    });

    render(<MyTribe user={{ role: 'tribe_assistant', tribe: 'Олени' }} />);

    expect(await screen.findByText('Вы участвовали')).toBeInTheDocument();
    expect(screen.getByText('Ваше участие не отмечено')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Помощник трайб-мастера/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Редактировать встречу/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Добавить встречу' })).not.toBeInTheDocument();
  });

  it('keeps status control in the status column and only delete in more', async () => {
    api.get.mockResolvedValue({
      tribe: '',
      rankings: [],
      students: [],
      student_events: [
        {
          id: 17,
          student_nick: 'peer',
          student_name: 'Peer',
          student_tribe: 'Короны',
          type: 'education',
          date: '2099-09-23',
          points: 0,
          status: 'pending',
        },
        {
          id: 18,
          student_nick: 'approved',
          student_name: 'Approved',
          student_tribe: 'Короны',
          type: 'education',
          date: '2099-09-23',
          points: 4,
          status: 'confirmed',
        },
        {
          id: 19,
          student_nick: 'declined',
          student_name: 'Declined',
          student_tribe: 'Короны',
          type: 'education',
          date: '2099-09-23',
          points: 0,
          status: 'rejected',
        },
      ],
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
    expect(statusSelect).toHaveClass('pending');
    expect(screen.getByRole('combobox', { name: 'Статус мероприятия approved' })).toHaveClass('confirmed');
    expect(screen.getByRole('combobox', { name: 'Статус мероприятия declined' })).toHaveClass('rejected');
  });
});
