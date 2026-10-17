import { API_URL, getToken } from '../api';

let sdkPromise;

export function loadTelegramSdk() {
  if (window.Telegram?.WebApp) return Promise.resolve(window.Telegram.WebApp);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = window.setTimeout(() => { script.remove(); reject(new Error('Не удалось загрузить Telegram. Открой мини-ап заново.')); }, 7000);
    script.src = 'https://telegram.org/js/telegram-web-app.js?64';
    script.async = true;
    script.onload = () => { window.clearTimeout(timeout); resolve(window.Telegram?.WebApp); };
    script.onerror = () => { window.clearTimeout(timeout); script.remove(); reject(new Error('Не удалось загрузить Telegram. Проверь подключение.')); };
    document.head.appendChild(script);
  }).catch((error) => { sdkPromise = null; throw error; });
  return sdkPromise;
}

export function createMiniAppClient(authorization) {
  return async (path = '', body) => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${API_URL}/api/penalty-miniapp${path}`, {
        method: body === undefined ? 'GET' : 'POST', cache: 'no-store',
        headers: { ...(authorization ? { Authorization: authorization } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) {
        const error = new Error(data.error || 'Не удалось выполнить действие');
        error.code = data.code;
        error.status = response.status;
        throw error;
      }
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('Сервер долго отвечает. Обнови данные перед повторной попыткой.');
      if (error instanceof TypeError) throw new Error('Нет связи с сервером. Проверь подключение и повтори.');
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  };
}

export async function initializeMiniApp() {
  let sdk = window.Telegram?.WebApp;
  const fromTelegram = new URLSearchParams(window.location.hash.slice(1)).has('tgWebAppData');
  if (!sdk && fromTelegram) sdk = await loadTelegramSdk();
  if (sdk?.initData) {
    const login = await createMiniAppClient()('/auth', { init_data: sdk.initData });
    // Keep the scoped credential in memory, never in URLs or persistent storage.
    return { request: createMiniAppClient(`MiniApp ${login.token}`), sdk };
  }
  const token = getToken();
  if (token) return { request: createMiniAppClient(`Bearer ${token}`), sdk: null };
  const error = new Error('Открой «Выдача пенальти» в боте или войди на платформу.');
  error.code = 'login_required';
  throw error;
}

export function operationId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}
