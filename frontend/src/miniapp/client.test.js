import { createMiniAppClient, initializeMiniApp } from './client';
import { getToken, setSession } from '../api';

jest.mock('../api', () => ({ API_URL: '', getToken: jest.fn(), setSession: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  delete window.Telegram;
  getToken.mockReturnValue(null);
  global.fetch = jest.fn();
});

test('Telegram login sends raw initData, never unsafe username or ID', async () => {
  window.Telegram = { WebApp: { initData: 'signed-telegram-data', initDataUnsafe: { user: { id: 999999 } } } };
  fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ token: 'scoped-token', user: { id: 7 } }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 'platform-token', user: { id: 7, role: 'volunteer' } }) })
    .mockResolvedValue({ ok: true, json: async () => ({}) });
  const { request } = await initializeMiniApp();
  expect(fetch).toHaveBeenCalledWith('/api/penalty-miniapp/auth', expect.objectContaining({ body: JSON.stringify({ init_data: 'signed-telegram-data' }) }));
  expect(fetch).toHaveBeenNthCalledWith(2, '/api/penalty-miniapp/platform-session', expect.objectContaining({
    headers: { Authorization: 'MiniApp scoped-token', 'Content-Type': 'application/json' }, body: '{}',
  }));
  expect(setSession).toHaveBeenCalledWith('platform-token', { id: 7, role: 'volunteer' });
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
  expect(setSession).not.toHaveBeenCalled();
});

test('failed writes are not blindly retried', async () => {
  fetch.mockRejectedValue(new TypeError('network'));
  await expect(createMiniAppClient('MiniApp test')('/penalties/1/commit', { draft_token: 'draft' })).rejects.toThrow('Нет связи');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(setSession).not.toHaveBeenCalled();
});

test('failed or mismatched platform exchange cannot reuse another cached identity', async () => {
  window.Telegram = { WebApp: { initData: 'signed' } };
  getToken.mockReturnValue('another-browser-user');
  fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ token: 'scoped', user: { id: 7 } }) })
    .mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ error: 'Доступ закрыт' }) });
  await expect(initializeMiniApp()).rejects.toThrow('Доступ закрыт');
  expect(setSession).not.toHaveBeenCalled();
  fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ token: 'scoped', user: { id: 7 } }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 'wrong', user: { id: 8 } }) });
  await expect(initializeMiniApp()).rejects.toThrow('подтвердить аккаунт');
  expect(setSession).not.toHaveBeenCalled();
});

test('a completed old login cannot replace a newer session after leaving the miniapp', async () => {
  window.Telegram = { WebApp: { initData: 'signed' } };
  fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ token: 'scoped', user: { id: 7 } }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 'platform', user: { id: 7 } }) });
  await initializeMiniApp({ isCurrent: () => false });
  expect(setSession).not.toHaveBeenCalled();
});

test('authorization failure does not fall back to another identity', async () => {
  window.Telegram = { WebApp: { initData: 'forged' } };
  getToken.mockReturnValue('another-browser-user');
  fetch.mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'Недействительная подпись', code: 'invalid_telegram_data' }) });
  await expect(initializeMiniApp()).rejects.toThrow('Недействительная подпись');
  expect(fetch).toHaveBeenCalledTimes(1);
});
