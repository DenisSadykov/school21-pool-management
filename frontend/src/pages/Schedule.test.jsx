import React from 'react';
import { render, screen } from '@testing-library/react';
import Schedule from './Schedule';
import { api } from '../api';
import useIsMobile from '../useIsMobile';

jest.mock('../api', () => ({ api: { get: jest.fn() } }));
jest.mock('../useIsMobile');
jest.mock('../utils/date', () => ({ moscowTodayIso: () => '2026-10-18' }));

for (const mobile of [false, true]) {
  for (const exam of [false, true]) {
    it(`labels only today on ${mobile ? 'mobile' : 'desktop'}${exam ? ' during an exam' : ''}`, async () => {
      useIsMobile.mockReturnValue(mobile);
      api.get.mockResolvedValue({
        pool: { id: 1, name: 'Test pool' },
        days: [{
          date: '2026-10-18',
          blocks: [{ id: 1, date: '2026-10-18', time_start: '10:00', time_end: '14:00',
            label: exam ? 'EXAM' : '', capacity: 2, count: 0, volunteers: [] }],
        }, { date: '2026-10-19', blocks: [] }],
      });
      const { container } = render(<Schedule user={{ id: 1, role: 'volunteer' }} />);
      expect(await screen.findByText(/Сегодня/)).toBeVisible();
      const current = container.querySelectorAll('[aria-current="date"]');
      expect(current).toHaveLength(1);
      expect(current[0]).toHaveClass('today');
      expect(container.querySelector('.block-card.today')).toBeInTheDocument();
      if (exam) expect(current[0]).toHaveTextContent('Экзамен');
      if (mobile) expect(current[0].closest('.day-section')).toHaveClass('today');
    });
  }
}
