import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TribeScripts from './TribeScripts';
import { api } from '../api';

jest.mock('../api', () => ({
  api: {
    get: jest.fn(),
    patch: jest.fn(),
  },
}));

const template = {
  id: 'deer-welcome',
  title: 'Приветствие и правила чата',
  category: 'start',
  kind: 'standard',
  day_offset: 0,
  note: 'Проверь детали.',
  text: '*Привет, трайб!* :wave:',
  recommended_date: '2026-07-17',
  sent: false,
  sent_at: null,
  variables: [],
};

describe('TribeScripts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.get.mockResolvedValue({
      tribe: 'Олени',
      pool_name: 'Тестовый бассейн',
      templates: [template],
      summary: { total: 1, sent: 0, remaining: 1 },
    });
  });

  it('loads the current tribe templates and expands Rocket.Chat text', async () => {
    render(<TribeScripts />);

    expect(await screen.findByRole('heading', { name: 'Приветствие и правила чата' })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/api/tribe-scripts');
    expect(screen.queryByText('Тестовый бассейн')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Показать текст: Приветствие и правила чата' }));
    expect(screen.getByText('*Привет, трайб!* :wave:')).toBeInTheDocument();
  });

  it('moves a sent template into the collapsed archive', async () => {
    api.patch.mockResolvedValue({
      template_id: template.id,
      sent: true,
      sent_at: '2026-07-17T12:00:00',
    });
    render(<TribeScripts />);

    fireEvent.click(await screen.findByRole('button', { name: 'Отметить отправленным' }));

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      `/api/tribe-scripts/${encodeURIComponent(template.id)}`,
      { sent: true },
    ));
    await waitFor(() => expect(screen.getByText('1 из 1')).toBeInTheDocument());
    expect(screen.getByText('Отправленные')).toBeInTheDocument();
  });

  it('fills variables before copying the final message', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    api.get.mockResolvedValue({
      tribe: 'Олени',
      pool_name: 'Тестовый бассейн',
      templates: [{
        ...template,
        id: 'deer-meeting',
        title: 'Первая встреча',
        text: '*Встреча:* {{meeting_time}}',
        variables: [{
          key: 'meeting_time',
          label: 'Время',
          placeholder: '16:00',
          default: '',
        }],
      }],
      summary: { total: 1, sent: 0, remaining: 1 },
    });
    render(<TribeScripts />);

    fireEvent.click(await screen.findByRole('button', { name: 'Показать текст: Первая встреча' }));
    fireEvent.change(screen.getByLabelText('Время'), { target: { value: '16:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Копировать' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('*Встреча:* 16:00'));
  });

  it('orders standard and special templates together by date', async () => {
    api.get.mockResolvedValue({
      tribe: 'Олени',
      pool_name: 'Тестовый бассейн',
      templates: [
        { ...template, id: 'late-standard', title: 'Позднее стандартное', recommended_date: '2026-07-27' },
        { ...template, id: 'early-special', title: 'Раннее особое', kind: 'special', recommended_date: '2026-07-22' },
        { ...template, id: 'middle-standard', title: 'Среднее стандартное', recommended_date: '2026-07-23' },
      ],
      summary: { total: 3, sent: 0, remaining: 3 },
    });

    render(<TribeScripts />);

    await screen.findByRole('heading', { name: 'Раннее особое' });
    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
      'Раннее особое',
      'Среднее стандартное',
      'Позднее стандартное',
    ]);
  });
});
