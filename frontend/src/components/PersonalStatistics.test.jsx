import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PersonalStatistics from './PersonalStatistics';
import { api } from '../api';

jest.mock('../api', () => ({ api: { get: jest.fn() } }));
const pool = (id, name) => ({ id, name, start_date: '2026-09-01', role: 'volunteer', state: 'ended',
  past_shifts: 2, past_hours: 8, upcoming_shifts: 1, group_reviews: 0, tribe_meetings: 0, coins: 120,
  manual_event_count: null, coin_breakdown: [{ type: 'shift', label: 'Смены', count: 8, coins: 120 }] });
const payload = {
  as_of: '2026-10-11T12:00:00', summary: { pools: 2, active_pools: 2, past_shifts: 4, upcoming_shifts: 2, past_hours: 16, coins: 240 },
  monthly_activity: [{ month: '2026-09', shifts: 4, hours: 16 }, { month: '2026-10', shifts: 0, hours: 0 }],
  pools: [pool(1, 'Первый бассейн'), pool(2, 'Python')], upcoming_shifts: [], warnings: [], unscoped_rewards: { count: 0, coins: 0 },
  achievements: [{ id: 'first_shift', title: 'Первый шаг', description: 'Первая прошедшая запись на смену', value: 4, target: 1, unlocked: true },
    { id: 'ten_shifts', title: 'Надёжное плечо', description: '10 прошедших записей на смены', value: 4, target: 10, unlocked: false }],
};
const show = () => render(<MemoryRouter><PersonalStatistics userId={1} /></MemoryRouter>);

beforeEach(() => { jest.clearAllMocks(); api.get.mockResolvedValue(payload); });

test('shows statistics without achievements even with an old API payload', async () => {
  show();
  expect(screen.getByRole('status')).toHaveTextContent('Загружаем');
  expect(await screen.findByRole('heading', { name: 'Ваш ритм' })).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledWith('/api/me/statistics');
  expect(screen.getByRole('listitem', { name: 'сентябрь 2026 г.: 16 ч., смен: 4' })).toBeInTheDocument();
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  expect(screen.queryByText('Маленькие победы')).not.toBeInTheDocument();
  expect(screen.queryByText('Первый шаг')).not.toBeInTheDocument();
  expect(screen.getByText(/не подтверждает фактический выход/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Открыть график смен' })).toHaveAttribute('href', '/schedule');
  fireEvent.change(screen.getByLabelText('Бассейн'), { target: { value: '2' } });
  expect(screen.queryByRole('heading', { name: 'Первый бассейн' })).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Python' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Бассейн'), { target: { value: 'all' } });
  expect(screen.getByRole('heading', { name: 'Первый бассейн' })).toBeInTheDocument();
});

test('failure can be retried without hiding account settings', async () => {
  api.get.mockRejectedValueOnce(new Error('Нет соединения'));
  show();
  expect(await screen.findByRole('alert')).toHaveTextContent('Нет соединения');
  fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
  expect(await screen.findByRole('heading', { name: 'Ваш ритм' })).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledTimes(2);
});

test('monthly bars preserve their scale, empty months, labels and accessible values', async () => {
  show();
  const activeMonth = await screen.findByRole('listitem', { name: 'сентябрь 2026 г.: 16 ч., смен: 4' });
  const emptyMonth = screen.getByRole('listitem', { name: 'октябрь 2026 г.: 0 ч., смен: 0' });
  expect(activeMonth.querySelector('.personal-chart-bar')).toHaveStyle({ height: '100%' });
  expect(emptyMonth.querySelector('.personal-chart-bar')).toHaveStyle({ height: '0%' });
  expect(activeMonth.querySelector('.personal-chart-value')).toHaveTextContent('16');
  expect(emptyMonth.querySelector('.personal-chart-value')).toHaveTextContent('—');
  expect(activeMonth.querySelector('.personal-chart-label')).toHaveTextContent('сент');
  expect(emptyMonth.querySelector('.personal-chart-label')).toHaveTextContent('окт');
});

test('empty history never invents participation or rewards', async () => {
  api.get.mockResolvedValue({ ...payload, pools: [], achievements: [], monthly_activity: [],
    summary: { pools: 0, active_pools: 0, past_shifts: 0, upcoming_shifts: 0, past_hours: 0, coins: 0 } });
  show();
  expect(await screen.findByText(/Пока нет привязок к бассейнам/)).toBeInTheDocument();
  expect(screen.getByText(/Когда появятся прошедшие смены/)).toBeInTheDocument();
});
