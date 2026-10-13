import { api, clearSession, getToken, getUser, setSession, SESSION_INVALIDATED_EVENT } from './api';

const response = (status, data) => ({
  status, ok: status >= 200 && status < 300,
  json: jest.fn().mockResolvedValue(data),
  blob: jest.fn().mockResolvedValue(new Blob(['file'])),
});
const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError' });
const methods = ['get', 'post', 'patch', 'del', 'upload', 'download'];
const callApi = (method) => method === 'upload'
  ? api.upload('/api/session', new FormData())
  : api[method]('/api/session');
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const blockedStorage = () => jest.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
  throw new DOMException('Storage blocked', 'SecurityError');
});

beforeEach(() => {
  global.fetch = jest.fn();
  localStorage.clear();
  clearSession();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  clearSession();
  localStorage.clear();
});

test.each(['get', 'post', 'patch', 'del'])('bypasses cached hosting redirects for %s API requests', async (method) => {
  fetch.mockResolvedValue(response(200, { ok: true }));
  await api[method]('/api/dashboard');
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/dashboard'), expect.objectContaining({
    cache: 'no-store',
  }));
});

test('bypasses cached redirects on both read attempts', async () => {
  fetch.mockRejectedValueOnce(new TypeError('redirect loop')).mockResolvedValueOnce(response(200, {}));
  await api.get('/api/dashboard');
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls.every(([, options]) => options.cache === 'no-store')).toBe(true);
});

test('bypasses cached redirects for file uploads', async () => {
  fetch.mockResolvedValue(response(200, { ok: true }));
  await api.upload('/api/upload', new FormData());
  expect(fetch.mock.calls[0][1].cache).toBe('no-store');
});

test('bypasses cached redirects for file downloads', async () => {
  fetch.mockResolvedValue({ ...response(200, {}), blob: jest.fn().mockResolvedValue(new Blob()) });
  await api.download('/api/export');
  expect(fetch.mock.calls[0][1].cache).toBe('no-store');
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

describe('session-aware 401 handling', () => {
  let listener;
  beforeEach(() => {
    listener = jest.fn();
    window.addEventListener(SESSION_INVALIDATED_EVENT, listener);
  });
  afterEach(() => {
    window.removeEventListener(SESSION_INVALIDATED_EVENT, listener);
  });

  test.each(methods)('a stale %s 401 preserves the newer login', async (method) => {
    setSession('old-token', { id: 1 });
    const oldResponse = deferred();
    fetch.mockReturnValueOnce(oldResponse.promise);
    const pending = callApi(method);
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer old-token');

    setSession('new-token', { id: 2 });
    oldResponse.resolve(response(401, { error: 'expired' }));
    await expect(pending).rejects.toThrow(method === 'download' ? 'Сессия истекла' : 'expired');
    expect(getToken()).toBe('new-token');
    expect(getUser()).toEqual({ id: 2 });
    expect(localStorage.getItem('token')).toBe('new-token');
    expect(localStorage.getItem('user')).toBe('{"id":2}');
    expect(listener).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test.each(methods)('a stale %s 401 preserves a new session reusing the same token', async (method) => {
    setSession('same-token', { id: 1 });
    const oldResponse = deferred();
    fetch.mockReturnValueOnce(oldResponse.promise);
    const pending = callApi(method);
    clearSession();
    setSession('same-token', { id: 2 });

    oldResponse.resolve(response(401, { error: 'expired' }));
    await expect(pending).rejects.toThrow();
    expect(getToken()).toBe('same-token');
    expect(getUser()).toEqual({ id: 2 });
    expect(listener).not.toHaveBeenCalled();
  });

  test.each(methods)('an anonymous %s 401 does not invalidate a subsequent login', async (method) => {
    const oldResponse = deferred();
    fetch.mockReturnValueOnce(oldResponse.promise);
    const pending = callApi(method);
    expect(fetch.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
    setSession('new-token', { id: 2 });

    oldResponse.resolve(response(401, { error: 'expired' }));
    await expect(pending).rejects.toThrow();
    expect(getToken()).toBe('new-token');
    expect(getUser()).toEqual({ id: 2 });
    expect(listener).not.toHaveBeenCalled();
  });

  test.each(methods)('an active %s 401 clears both session fields and emits one event', async (method) => {
    setSession('expired', { id: 1 });
    fetch.mockResolvedValueOnce(response(401, { error: 'expired' }));
    await expect(callApi(method)).rejects.toThrow();
    expect(getToken()).toBeNull();
    expect(getUser()).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test.each(methods)('a %s 401 after logout does not emit another invalidation', async (method) => {
    setSession('old-token', { id: 1 });
    const oldResponse = deferred();
    fetch.mockReturnValueOnce(oldResponse.promise);
    const pending = callApi(method);
    clearSession();

    oldResponse.resolve(response(401, { error: 'expired' }));
    await expect(pending).rejects.toThrow();
    expect(getToken()).toBeNull();
    expect(getUser()).toBeNull();
    expect(listener).not.toHaveBeenCalled();
  });

  test('a retried read still belongs to the session that started it', async () => {
    setSession('old-token', { id: 1 });
    const firstResponse = deferred();
    fetch.mockReturnValueOnce(firstResponse.promise).mockResolvedValueOnce(response(401, { error: 'expired' }));
    const pending = api.get('/api/session');
    setSession('new-token', { id: 2 });
    firstResponse.resolve(response(503, null));

    await expect(pending).rejects.toThrow('expired');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.every(([, options]) => options.headers.Authorization === 'Bearer old-token'
      && options.cache === 'no-store')).toBe(true);
    expect(getToken()).toBe('new-token');
    expect(getUser()).toEqual({ id: 2 });
    expect(listener).not.toHaveBeenCalled();
  });

  test.each(['get', 'upload'])('a login while a %s 401 body is pending preserves the new session', async (method) => {
    setSession('old-token', { id: 1 });
    const body = deferred();
    const bodyStarted = deferred();
    const json = jest.fn(() => {
      bodyStarted.resolve();
      return body.promise;
    });
    fetch.mockResolvedValueOnce({ ...response(401, null), json });
    const pending = callApi(method);
    await bodyStarted.promise;
    expect(json).toHaveBeenCalledTimes(1);
    setSession('new-token', { id: 2 });
    body.resolve({ error: 'expired' });

    await expect(pending).rejects.toThrow('expired');
    expect(getToken()).toBe('new-token');
    expect(getUser()).toEqual({ id: 2 });
    expect(listener).not.toHaveBeenCalled();
  });

  test('a replacement token written directly to storage survives an old 401', async () => {
    setSession('old-token', { id: 1 });
    const oldResponse = deferred();
    fetch.mockReturnValueOnce(oldResponse.promise);
    const pending = api.get('/api/session');
    localStorage.setItem('token', 'external-token');
    localStorage.setItem('user', '{"id":2}');
    oldResponse.resolve(response(401, { error: 'expired' }));

    await expect(pending).rejects.toThrow('expired');
    expect(getToken()).toBe('external-token');
    expect(getUser()).toEqual({ id: 2 });
    expect(listener).not.toHaveBeenCalled();
  });

  test('concurrent 401s invalidate the expired session only once', async () => {
    setSession('expired', { id: 1 });
    fetch.mockResolvedValue(response(401, { error: 'expired' }));
    const results = await Promise.allSettled([api.get('/api/session'), api.upload('/api/session', new FormData()),
      api.download('/api/session')]);
    expect(results.every((result) => result.status === 'rejected')).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getToken()).toBeNull();
    expect(getUser()).toBeNull();
  });

  test.each(['get', 'upload', 'download'])('stale and active %s 401s work with memory sessions', async (method) => {
    setSession('persisted-token', { id: 0 });
    const storage = blockedStorage();
    setSession('old-token', { id: 1 });
    const oldResponse = deferred();
    fetch.mockReturnValueOnce(oldResponse.promise);
    const pending = callApi(method);
    setSession('new-token', { id: 2 });
    oldResponse.resolve(response(401, { error: 'expired' }));

    await expect(pending).rejects.toThrow();
    expect(getToken()).toBe('new-token');
    expect(getUser()).toEqual({ id: 2 });
    expect(listener).not.toHaveBeenCalled();
    fetch.mockResolvedValueOnce(response(401, { error: 'expired' }));
    await expect(callApi(method)).rejects.toThrow();
    expect(fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer new-token');
    expect(getToken()).toBeNull();
    expect(getUser()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    storage.mockRestore();
    expect(getToken()).toBeNull();
    expect(getUser()).toBeNull();
  });
});

describe('safe session storage fallback', () => {
  test('persists a session and removes both fields on logout', () => {
    setSession('token', { id: 1 });
    expect(localStorage.getItem('token')).toBe('token');
    expect(localStorage.getItem('user')).toBe('{"id":1}');
    expect(getToken()).toBe('token');
    expect(getUser()).toEqual({ id: 1 });
    clearSession();
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
    expect(getToken()).toBeNull();
    expect(getUser()).toBeNull();
  });

  test.each(methods)('%s authenticates from memory when storage access is blocked and stops after logout', async (method) => {
    setSession('persisted-token', { id: 0 });
    const storage = blockedStorage();
    setSession('memory-token', { id: 1 });
    expect(getToken()).toBe('memory-token');
    expect(getUser()).toEqual({ id: 1 });
    fetch.mockResolvedValue(response(200, { ok: true }));
    await callApi(method);
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer memory-token');
    expect(fetch.mock.calls[0][1].cache).toBe('no-store');
    clearSession();
    expect(getToken()).toBeNull();
    expect(getUser()).toBeNull();
    storage.mockRestore();
    expect(getToken()).toBeNull();
    expect(getUser()).toBeNull();
    await callApi(method);
    expect(fetch.mock.calls[1][1].headers).not.toHaveProperty('Authorization');
  });

  test.each(['token', 'user'])('a quota error saving %s keeps the complete new session in memory', async (key) => {
    setSession('old-token', { id: 0 });
    const originalSetItem = Storage.prototype.setItem;
    const storage = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function (name, value) {
      if (name === key) throw new DOMException('Storage full', 'QuotaExceededError');
      return originalSetItem.call(this, name, value);
    });
    setSession('new-token', { id: 1 });
    expect(getToken()).toBe('new-token');
    expect(getUser()).toEqual({ id: 1 });
    storage.mockRestore();
    // Reads must not adopt the old or partially written stored session.
    expect(getToken()).toBe('new-token');
    expect(getUser()).toEqual({ id: 1 });
    fetch.mockResolvedValue(response(200, {}));
    await api.get('/api/session');
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer new-token');
    clearSession();
    expect(getToken()).toBeNull();
    expect(getUser()).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });

  test.each(['token', 'user'])('logout cannot restore a stale session when removing %s fails', async (key) => {
    setSession('old-token', { id: 1 });
    const originalRemoveItem = Storage.prototype.removeItem;
    const storage = jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (name) {
      if (name === key) throw new DOMException('Storage blocked', 'SecurityError');
      return originalRemoveItem.call(this, name);
    });
    clearSession();
    expect(storage.mock.calls.map(([name]) => name)).toEqual(expect.arrayContaining(['token', 'user']));
    expect(getToken()).toBeNull();
    expect(getUser()).toBeNull();
    storage.mockRestore();
    expect(getToken()).toBeNull();
    expect(getUser()).toBeNull();
    fetch.mockResolvedValue(response(200, {}));
    await api.get('/api/session');
    expect(fetch.mock.calls[0][1].headers).not.toHaveProperty('Authorization');

    setSession('new-token', { id: 2 });
    expect(getToken()).toBe('new-token');
    expect(getUser()).toEqual({ id: 2 });
    expect(localStorage.getItem('token')).toBe('new-token');
    expect(localStorage.getItem('user')).toBe('{"id":2}');
  });

  test('storage read errors keep the cached token and user without removing the session', () => {
    localStorage.setItem('token', 'cached-token');
    localStorage.setItem('user', '{"id":1}');
    expect(getToken()).toBe('cached-token');
    expect(getUser()).toEqual({ id: 1 });
    const storage = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage blocked', 'SecurityError');
    });
    const remove = jest.spyOn(Storage.prototype, 'removeItem');
    expect(getUser()).toEqual({ id: 1 });
    expect(getToken()).toBe('cached-token');
    expect(remove).not.toHaveBeenCalled();
    storage.mockRestore();
    expect(localStorage.getItem('token')).toBe('cached-token');
    expect(localStorage.getItem('user')).toBe('{"id":1}');
  });

  test('a malformed stored user clears the cached and stored session', () => {
    setSession('token', { id: 1 });
    localStorage.setItem('user', '{broken');
    expect(getUser()).toBeNull();
    expect(getToken()).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
    const storage = blockedStorage();
    expect(getToken()).toBeNull();
    expect(getUser()).toBeNull();
    storage.mockRestore();
  });
});
