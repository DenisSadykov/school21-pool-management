import { api, SESSION_INVALIDATED_EVENT } from './api';

const response = (status, data) => ({
  status, ok: status >= 200 && status < 300,
  json: jest.fn().mockResolvedValue(data),
});
const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError' });

beforeEach(() => {
  global.fetch = jest.fn();
  localStorage.clear();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test.each([abortError(), new TypeError('network')])('retries a temporary read failure once', async (error) => {
  fetch.mockRejectedValueOnce(error).mockResolvedValueOnce(response(200, { days: [] }));
  await expect(api.get('/api/schedule')).resolves.toEqual({ days: [] });
  expect(fetch).toHaveBeenCalledTimes(2);
});

test.each([502, 503, 504])('retries a temporary HTTP %s read failure', async (status) => {
  fetch.mockResolvedValueOnce(response(status, null)).mockResolvedValueOnce(response(200, { ok: true }));
  await expect(api.get('/api/schedule')).resolves.toEqual({ ok: true });
  expect(fetch).toHaveBeenCalledTimes(2);
});

test('stops after the second failed read and preserves the session', async () => {
  localStorage.setItem('token', 'test-token');
  fetch.mockRejectedValue(abortError());
  await expect(api.get('/api/schedule')).rejects.toThrow('Сервер не отвечает');
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(localStorage.getItem('token')).toBe('test-token');
});

test.each(['post', 'patch', 'del'])('does not repeat %s writes after a timeout', async (method) => {
  fetch.mockRejectedValue(abortError());
  await expect(api[method]('/api/events', { title: 'event' })).rejects.toThrow('Сервер не отвечает');
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('does not repeat writes after a temporary HTTP failure', async () => {
  fetch.mockResolvedValue(response(503, { error: 'temporary' }));
  await expect(api.post('/api/events', {})).rejects.toThrow('temporary');
  expect(fetch).toHaveBeenCalledTimes(1);
});

test.each([400, 403, 404, 500])('does not repeat HTTP %s application errors', async (status) => {
  fetch.mockResolvedValue(response(status, { error: 'application error' }));
  await expect(api.get('/api/schedule')).rejects.toThrow('application error');
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('invalidates expired sessions without retrying', async () => {
  localStorage.setItem('token', 'expired');
  const listener = jest.fn();
  window.addEventListener(SESSION_INVALIDATED_EVENT, listener);
  try {
    fetch.mockResolvedValue(response(401, { error: 'expired' }));
    await expect(api.get('/api/schedule')).rejects.toThrow('expired');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('token')).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
  } finally {
    window.removeEventListener(SESSION_INVALIDATED_EVENT, listener);
  }
});

test('times out a stalled response body, then recovers with a fresh request', async () => {
  jest.useFakeTimers();
  fetch.mockImplementationOnce((url, { signal }) => Promise.resolve({
    status: 200, ok: true,
    json: () => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(abortError()));
    }),
  })).mockResolvedValueOnce(response(200, { days: [] }));
  const pending = api.get('/api/schedule');
  await Promise.resolve();
  jest.advanceTimersByTime(15000);
  await expect(pending).resolves.toEqual({ days: [] });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(jest.getTimerCount()).toBe(0);
});
