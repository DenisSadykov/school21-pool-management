// Единый клиент API: базовый URL, токен авторизации, обработка ошибок.
export const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';
const REQUEST_TIMEOUT_MS = 15000;
export const SESSION_INVALIDATED_EVENT = 'app:session-invalidated';

export function getToken() {
  try {
    return localStorage.getItem('token');
  } catch (error) {
    return null;
  }
}

export function getUser() {
  try {
    const u = localStorage.getItem('user');
    if (!u) return null;
    return JSON.parse(u);
  } catch (error) {
    // A broken cached session must never block the app before login renders.
    try {
      localStorage.removeItem('user');
      localStorage.removeItem('token');
    } catch (storageError) {
      /* storage can be unavailable in private browsing */
    }
    return null;
  }
}

export function setSession(token, user) {
  try {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
  } catch (error) {
    /* the current in-memory session can still be used */
  }
}

export function clearSession() {
  try {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  } catch (error) {
    /* storage can be unavailable in private browsing */
  }
}

function invalidateSession() {
  clearSession();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SESSION_INVALIDATED_EVENT));
  }
}

export const POOLS_CHANGED_EVENT = 'app:pools-changed';
const POOLS_CHANGED_STORAGE_KEY = 'app:pools-changed-at';

export function emitPoolsChanged() {
  if (typeof window !== 'undefined') {
    localStorage.setItem(POOLS_CHANGED_STORAGE_KEY, String(Date.now()));
    window.dispatchEvent(new Event(POOLS_CHANGED_EVENT));
  }
}

export function isPoolsChangedStorageEvent(event) {
  return event.key === POOLS_CHANGED_STORAGE_KEY;
}

async function request(path, { method = 'GET', body } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Сервер не отвечает. Проверь подключение и попробуй ещё раз.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    /* пустой ответ */
  }

  if (res.status === 401) {
    invalidateSession();
    throw new Error((data && data.error) || 'Сессия истекла. Войди заново.');
  }
  if (!res.ok) {
    throw new Error((data && data.error) || `Ошибка ${res.status}`);
  }
  return data;
}

async function upload(path, formData) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers,
      body: formData,
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Сервер не отвечает. Проверь подключение и попробуй ещё раз.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    /* пустой ответ */
  }

  if (res.status === 401) {
    invalidateSession();
    throw new Error((data && data.error) || 'Сессия истекла. Войди заново.');
  }
  if (!res.ok) {
    throw new Error((data && data.error) || `Ошибка ${res.status}`);
  }
  return data;
}

async function download(path) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, { headers, signal: controller.signal });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Сервер не отвечает. Проверь подключение и попробуй ещё раз.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
  if (res.status === 401) {
    invalidateSession();
    throw new Error('Сессия истекла. Войди заново.');
  }
  if (!res.ok) {
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      /* пустой ответ */
    }
    throw new Error((data && data.error) || `Ошибка ${res.status}`);
  }
  return res.blob();
}

export async function downloadFile(path, filename) {
  const blob = await download(path);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  del: (path) => request(path, { method: 'DELETE' }),
  download,
  upload,
};
