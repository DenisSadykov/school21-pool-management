// Единый клиент API: базовый URL, токен авторизации, обработка ошибок.
export const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

export function getToken() {
  return localStorage.getItem('token');
}

export function getUser() {
  const u = localStorage.getItem('user');
  return u ? JSON.parse(u) : null;
}

export function setSession(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

export function buildAuthenticatedAssetUrl(path) {
  if (!path) return '';
  const token = getToken();
  const separator = path.includes('?') ? '&' : '?';
  return `${API_URL}${path}${token ? `${separator}token=${encodeURIComponent(token)}` : ''}`;
}

async function request(path, { method = 'GET', body } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    /* пустой ответ */
  }

  if (res.status === 401) {
    clearSession();
    window.location.reload();
    return null;
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

  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers,
    body: formData,
  });

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    /* пустой ответ */
  }

  if (res.status === 401) {
    clearSession();
    window.location.reload();
    return null;
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

  const res = await fetch(`${API_URL}${path}`, { headers });
  if (res.status === 401) {
    clearSession();
    window.location.reload();
    return null;
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

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  del: (path) => request(path, { method: 'DELETE' }),
  download,
  upload,
};
