import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PersonalAchievements from './PersonalAchievements';
import { api } from '../api';

jest.mock('../api', () => ({ api: { get: jest.fn() }, API_URL: '', getToken: () => 'test-token' }));
const award = { id: 2, award_id: 3, title: 'альфаультрамегасигмагероиня',
  image_url: '/api/achievements/2/image', granted_at: '2026-10-18T22:30:00Z' };
const originalFetch = global.fetch;

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue([]);
  global.fetch = jest.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['image']) });
  URL.createObjectURL = jest.fn().mockReturnValue('blob:test-image');
  URL.revokeObjectURL = jest.fn();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterAll(() => { global.fetch = originalFetch; });

test('empty collection has no old awards, progress bars or issuing controls', async () => {
  render(<PersonalAchievements userId={1} />);
  expect(screen.getByRole('status')).toHaveTextContent('Загружаем');
  expect(await screen.findByText('Здесь появятся ваши ачивки')).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledWith('/api/me/achievements');
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

test('shows full title, Moscow date and authenticated image; opens and closes viewer', async () => {
  api.get.mockResolvedValue([award]);
  const { unmount } = render(<PersonalAchievements userId={1} />);
  const open = await screen.findByRole('button', { name: `Открыть ачивку «${award.title}»` });
  expect(screen.getByText('19 октября 2026 г.')).toBeInTheDocument();
  expect(await screen.findByRole('img', { name: award.title })).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith(award.image_url, expect.objectContaining({
    headers: { Authorization: 'Bearer test-token' }, signal: expect.any(AbortSignal),
  }));
  fireEvent.click(open);
  expect(screen.getByRole('dialog', { name: award.title })).toHaveAttribute('open');
  await waitFor(() => expect(screen.getAllByRole('img', { name: award.title })).toHaveLength(2));
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть изображение' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalled();
});

test('load error can be retried and image failure retains award text', async () => {
  api.get.mockRejectedValueOnce(new Error('Нет соединения')).mockResolvedValueOnce([award]);
  global.fetch.mockRejectedValue(new Error('offline'));
  render(<PersonalAchievements userId={1} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Нет соединения');
  fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
  expect(await screen.findByText('Не удалось загрузить изображение')).toBeInTheDocument();
  expect(screen.getByText(award.title)).toBeInTheDocument();
});

test('late response for a previous account never replaces current collection', async () => {
  let finishOld;
  api.get.mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; })).mockResolvedValueOnce([]);
  const { rerender } = render(<PersonalAchievements userId={1} />);
  rerender(<PersonalAchievements userId={2} />);
  expect(await screen.findByText('Здесь появятся ваши ачивки')).toBeInTheDocument();
  finishOld([award]);
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  expect(screen.queryByText(award.title)).not.toBeInTheDocument();
});
