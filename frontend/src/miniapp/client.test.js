import { createMiniAppClient, initializeMiniApp } from './client';
import { getToken } from '../api';

jest.mock('../api', () => ({ API_URL: '', getToken: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  delete window.Telegram;
  getToken.mockReturnValue(null);
  global.fetch = jest.fn();
});

test('Telegram login sends raw initData, never unsafe username or ID', async () => {
  window.Telegram = { WebApp: { initData: 'signed-telegram-data', initDataUnsafe: { user: { id: 999999 } } } };
  fetch.mockResolvedValue({ ok: true, json: async () => ({ token: 'scoped-token' }) });
  const { request } = await initializeMiniApp();
  expect(fetch).toHaveBeenCalledWith('/api/penalty-miniapp/auth', expect.objectContaining({ body: JSON.stringify({ init_data: 'signed-telegram-data' }) }));
  await request();
  expect(fetch).toHaveBeenLastCalledWith('/api/penalty-miniapp', expect.objectContaining({ headers: { Authorization: 'MiniApp scoped-token' } }));
});

test('browser mode requires existing platform authorization', async () => {
  await expect(initializeMiniApp()).rejects.toThrow('Открой');
  expect(fetch).not.toHaveBeenCalled();
  getToken.mockReturnValue('platform-token');
  fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
  const { request } = await initializeMiniApp();
  await request();
  expect(fetch).toHaveBeenLastCalledWith('/api/penalty-miniapp', expect.objectContaining({ headers: { Authorization: 'Bearer platform-token' } }));
});

test('failed writes are not blindly retried', async () => {
  fetch.mockRejectedValue(new TypeError('network'));
  await expect(createMiniAppClient('MiniApp test')('/penalties/1/commit', { draft_token: 'draft' })).rejects.toThrow('Нет связи');
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('authorization failure does not fall back to another identity', async () => {
  window.Telegram = { WebApp: { initData: 'forged' } };
  getToken.mockReturnValue('another-browser-user');
  fetch.mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'Недействительная подпись', code: 'invalid_telegram_data' }) });
  await expect(initializeMiniApp()).rejects.toThrow('Недействительная подпись');
  expect(fetch).toHaveBeenCalledTimes(1);
});
