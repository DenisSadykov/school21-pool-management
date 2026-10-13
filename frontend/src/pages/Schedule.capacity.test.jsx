import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import Schedule from './Schedule';
import { api } from '../api';

jest.mock('../api', () => ({ api: { get: jest.fn() } }));
jest.mock('../useIsMobile', () => () => true);
jest.mock('../utils/date', () => ({ moscowTodayIso: () => '2026-10-13' }));

const staff = { id: 1, nick: 'lead', role: 'team_lead' };
const cases = [
  ['limited shifts', [{ capacity: 3, count: 1 }, { capacity: 4, count: 1 }], '2/7'],
  ['unlimited shift', [{ capacity: null, count: 1 }], '1 · без лимита'],
  ['empty unlimited shift', [{ capacity: null, count: 0 }], '0 · без лимита'],
  ['multiple unlimited shifts', [{ capacity: null, count: 1 }, { capacity: null, count: 2 }], '3 · без лимита'],
  ['mixed shifts', [{ capacity: 5, count: 2 }, { capacity: null, count: 1 }], '2/5 + 1 без лимита'],
  ['zero capacity', [{ capacity: 0, count: 0 }], '0/0'],
  ['zero and unlimited capacities', [{ capacity: 0, count: 0 }, { capacity: null, count: 1 }], '0/0 + 1 без лимита'],
];

beforeEach(() => jest.clearAllMocks());

function loadDay(date, specs) {
  const blocks = specs.map((spec, index) => ({
    id: index + 1,
    time_start: `${10 + index}:00`,
    time_end: `${11 + index}:00`,
    label: '',
    volunteers: Array.from({ length: spec.count }, (_, volunteerIndex) => ({
      user_id: 10 + index * 10 + volunteerIndex, nick: `helper_${index}_${volunteerIndex}`,
    })),
    ...spec,
  }));
  api.get.mockImplementation((path) => Promise.resolve(path === '/api/schedule'
    ? { pool: { id: 1, name: 'Бассейн' }, days: [{ date, blocks }] }
    : []));
}

describe.each([
  ['upcoming', '2026-10-14'],
  ['past', '2026-10-12'],
])('%s day capacity summary', (period, date) => {
  it.each(cases)('accurately represents %s', async (name, specs, expected) => {
    loadDay(date, specs);
    const { container } = render(<Schedule user={staff} />);
    await screen.findByRole('button', { name: 'Запись включена' });
    if (period === 'past') {
      fireEvent.click(screen.getByText(/^Прошедшие смены/));
    }
    const header = container.querySelector('.day-section-header');
    expect(within(header).getByText(expected, { exact: true })).toBeInTheDocument();
  });
});

it('distinguishes a day without shifts from zero capacity', async () => {
  loadDay('2026-10-14', []);
  const { container } = render(<Schedule user={staff} />);
  await screen.findByRole('button', { name: 'Запись включена' });
  expect(within(container.querySelector('.day-section-header')).getByText('Нет смен')).toBeInTheDocument();
});
