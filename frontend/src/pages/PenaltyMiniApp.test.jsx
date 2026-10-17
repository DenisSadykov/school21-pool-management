import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PenaltyMiniApp, { formatCountdown, Roulette } from './PenaltyMiniApp';
import { playHaptic } from '../miniapp/haptics';
import { initializeMiniApp, operationId } from '../miniapp/client';

jest.mock('../miniapp/client', () => ({ initializeMiniApp: jest.fn(), operationId: jest.fn() }));

const catalog = [
  { id: 'common-area', title: 'Порядок в общей зоне', description: 'Не трогай личные вещи.', estimated_minutes: 15, icon: 'broom' },
  { id: 'navigation', title: 'Помочь с навигацией', description: 'Помоги найти аудиторию.', estimated_minutes: 15, icon: 'map' },
  { id: 'room-signs', title: 'Проверить таблички', description: 'Проверь таблички.', estimated_minutes: 10, icon: 'sign' },
];
let call;
let penalty;
let session;
const response = () => ({ penalty: { ...penalty, session }, server_now: new Date().toISOString() });

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  window.matchMedia = jest.fn((query) => ({ matches: query.includes('reduced-motion'), addEventListener: jest.fn(), removeEventListener: jest.fn() }));
  penalty = { id: 1, student_name: 'demo_peer', total_hours: 2, completed_hours: 0, workoff_status: 'pending', session: null };
  session = null;
  operationId.mockReturnValue('synthetic-request-operation');
  call = jest.fn(async (path = '') => {
    if (!path) return { catalog, penalties: [{ ...penalty, session }], server_now: new Date().toISOString() };
    if (path === '/working') return { workers: penalty.workoff_status === 'in_workoff' ? [{ ...penalty, session }] : [], server_now: new Date().toISOString() };
    if (path.endsWith('/spin')) return { task: catalog[0], draft_token: 'synthetic-draft' };
    return response();
  });
  initializeMiniApp.mockResolvedValue({ request: call, sdk: null });
  window.scrollTo = jest.fn();
  window.history.replaceState({}, '', '/');
});

async function selectPupil() {
  fireEvent.change(await screen.findByLabelText('Кому выдаём'), { target: { value: '1' } });
}

async function preview() {
  await selectPupil();
  fireEvent.click(screen.getByRole('button', { name: 'Выбрать' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Зафиксировать пенальти' })).toBeEnabled());
}

async function ready() {
  render(<PenaltyMiniApp />);
  await preview();
}

function activeSession() {
  return {
    id: 4, status: 'active', started_at: new Date(Date.now() - 1000).toISOString(),
    ends_at: new Date(Date.now() + 7100000).toISOString(),
    current_task: { ...catalog[0], id: 11, task_key: 'common-area', status: 'active', assigned_by_nick: 'demo_volunteer' },
    tasks: [{ ...catalog[0], id: 11, status: 'active', assigned_by_nick: 'demo_volunteer' }],
  };
}

test('preview does not commit and controls have distinct names', async () => {
  await ready();
  expect(screen.getByRole('heading', { name: /Выдаватель пенальти/ })).toBeInTheDocument();
  expect(screen.getByLabelText('Кому выдаём')).toHaveValue('1');
  expect(screen.getByRole('button', { name: 'Выбрать другое' })).toBeEnabled();
  expect(call.mock.calls.some(([path = '']) => path.endsWith('/commit'))).toBe(false);
});

test('reroll only requests another preview', async () => {
  await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Выбрать другое' }));
  await waitFor(() => expect(call.mock.calls.filter(([path = '']) => path.endsWith('/spin'))).toHaveLength(2));
  expect(call).toHaveBeenLastCalledWith('/penalties/1/spin', { exclude_keys: ['common-area'] });
  expect(call.mock.calls.some(([path = '']) => path.endsWith('/commit'))).toBe(false);
});

test('confirmation sends signed preview once and shows shared session', async () => {
  await ready();
  let resolve;
  call.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  const button = screen.getByRole('button', { name: 'Зафиксировать пенальти' });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(call.mock.calls.filter(([path = '']) => path.endsWith('/commit'))).toHaveLength(1);
  expect(call).toHaveBeenLastCalledWith('/penalties/1/commit', { draft_token: 'synthetic-draft' });
  penalty.workoff_status = 'in_workoff';
  session = activeSession();
  await act(async () => resolve(response()));
  expect(await screen.findByRole('button', { name: 'Выполнено — следующее' })).toBeInTheDocument();
  expect(screen.getByText('Смена задания не обнуляет таймер')).toBeInTheDocument();
});

test('an existing session is restored without spinning or resetting it', async () => {
  penalty.workoff_status = 'in_workoff';
  session = activeSession();
  render(<PenaltyMiniApp />);
  await selectPupil();
  expect(await screen.findByRole('button', { name: 'Выполнено — следующее' })).toBeInTheDocument();
  expect(call.mock.calls.some(([path = '']) => path.endsWith('/spin'))).toBe(false);
  expect(screen.getByText('Осталось из 2 часов')).toBeInTheDocument();
});

test('short task uses completion endpoint instead of finishing penalty', async () => {
  penalty.workoff_status = 'in_workoff'; session = activeSession();
  render(<PenaltyMiniApp />);
  await selectPupil();
  fireEvent.click(await screen.findByRole('button', { name: 'Выполнено — следующее' }));
  await waitFor(() => expect(call).toHaveBeenCalledWith('/penalties/1/task-action', {
    task_id: 11, action: 'complete', request_id: 'synthetic-request-operation',
  }));
  expect(call.mock.calls.some(([path = '']) => path.endsWith('/finish'))).toBe(false);
});

test('timer expiry asks for confirmation and never finishes automatically', async () => {
  penalty.workoff_status = 'in_workoff'; session = activeSession();
  session.ends_at = new Date(Date.now() - 1000).toISOString();
  render(<PenaltyMiniApp />);
  await selectPupil();
  fireEvent.click(await screen.findByRole('button', { name: 'Подтвердить 2 часа отработки' }));
  expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  expect(call.mock.calls.some(([path = '']) => path.endsWith('/finish'))).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
});

test('empty pool has a useful empty state and cannot issue a new penalty', async () => {
  call.mockResolvedValue({ penalties: [], catalog, server_now: new Date().toISOString() });
  render(<PenaltyMiniApp />);
  expect(await screen.findByText('Пока нет пенальти для отработки')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Зафиксировать пенальти' })).not.toBeInTheDocument();
});

test('miniapp uses the platform theme instead of a separate Telegram palette', async () => {
  localStorage.setItem('uiTheme', 'dark');
  const sdk = { colorScheme: 'light', themeParams: { bg_color: '#123456' }, ready: jest.fn(), expand: jest.fn() };
  initializeMiniApp.mockResolvedValue({ request: call, sdk });
  const { container } = render(<PenaltyMiniApp />);
  await waitFor(() => expect(sdk.ready).toHaveBeenCalled());
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  expect(container.querySelector('main')).not.toHaveAttribute('style');
  expect(sdk.expand).toHaveBeenCalled();
});

test('login errors are shown without exposing data', async () => {
  initializeMiniApp.mockRejectedValue(new Error('Открой мини-ап из привязанного Telegram'));
  render(<PenaltyMiniApp />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Открой мини-ап из привязанного Telegram');
  expect(screen.getByRole('link', { name: 'Войти на платформу' })).toHaveAttribute('href', '/miniapp/platform#/login');
});

test('countdown formatting clamps negative time', () => {
  expect(formatCountdown(7200)).toBe('02:00:00');
  expect(formatCountdown(95)).toBe('00:01:35');
  expect(formatCountdown(-2)).toBe('00:00:00');
});

test('bottom menu opens working students and their preserved session', async () => {
  penalty.workoff_status = 'in_workoff'; session = activeSession();
  render(<PenaltyMiniApp />);
  fireEvent.click(await screen.findByRole('link', { name: /Отрабатывают сейчас/ }));
  expect(await screen.findByRole('heading', { name: 'Отрабатывают сейчас' })).toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button', { name: 'Открыть отработку @demo_peer' }));
  expect(await screen.findByRole('button', { name: 'Выполнено — следующее' })).toBeInTheDocument();
  expect(call).toHaveBeenCalledWith('/penalties/1');
  expect(call.mock.calls.some(([path = '']) => path.endsWith('/commit'))).toBe(false);
});

test('working menu has a useful empty state', async () => {
  await ready();
  fireEvent.click(screen.getByRole('link', { name: /Отрабатывают сейчас/ }));
  expect(await screen.findByText('Сейчас никто не отрабатывает')).toBeInTheDocument();
});

test('platform menu stays in the miniapp and preserves its preview and authorization', async () => {
  const renderPlatform = (navigate) => <section><h1>Настоящая платформа</h1><button onClick={() => navigate('issue')}>Назад к рулетке</button></section>;
  render(<PenaltyMiniApp renderPlatform={renderPlatform} />);
  const initialPath = window.location.pathname;
  await preview();
  fireEvent.click(await screen.findByRole('link', { name: 'Платформа' }));
  expect(screen.getByRole('heading', { name: 'Настоящая платформа' })).toBeInTheDocument();
  expect(window.location.pathname).toBe(initialPath);
  fireEvent.click(screen.getByRole('button', { name: 'Назад к рулетке' }));
  expect(await screen.findByRole('button', { name: 'Зафиксировать пенальти' })).toBeEnabled();
  expect(initializeMiniApp).toHaveBeenCalledTimes(1);
  expect(call.mock.calls.filter(([path = '']) => path.endsWith('/spin'))).toHaveLength(1);
  expect(call.mock.calls.some(([path = '']) => path.endsWith('/commit'))).toBe(false);
});

test('platform fallback is same-window and never puts credentials into the URL', async () => {
  await ready();
  const link = screen.getByRole('link', { name: 'Платформа' });
  expect(link).toHaveAttribute('href', '/miniapp/platform#/');
  expect(link).not.toHaveAttribute('target');
});

test('opening and selecting a pupil never spins, including a pending deep link', async () => {
  const { unmount } = render(<PenaltyMiniApp />);
  const select = await screen.findByLabelText('Кому выдаём');
  expect(select).toHaveValue('');
  expect(screen.getByRole('button', { name: 'Выбрать' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Зафиксировать пенальти' })).toBeDisabled();
  await selectPupil();
  expect(screen.getByRole('button', { name: 'Выбрать' })).toBeEnabled();
  expect(screen.getByText('Нажми «Выбрать»')).toBeInTheDocument();
  expect(call.mock.calls.some(([path = '']) => path.endsWith('/spin'))).toBe(false);
  unmount();
  window.history.replaceState({}, '', '/?penalty=1');
  render(<PenaltyMiniApp />);
  expect(await screen.findByLabelText('Кому выдаём')).toHaveValue('1');
  expect(screen.getByRole('button', { name: 'Зафиксировать пенальти' })).toBeDisabled();
  expect(call.mock.calls.some(([path = '']) => path.endsWith('/spin'))).toBe(false);
});

test('pupil options use pool-local numbers, never the global record ID', async () => {
  penalty = { ...penalty, id: 101, pool_number: 2 };
  render(<PenaltyMiniApp />);
  expect(await screen.findByRole('option', { name: '@demo_peer · пенальти №2' })).toHaveValue('101');
  expect(screen.queryByRole('option', { name: /101/ })).not.toBeInTheDocument();
});

test('changing pupil clears a preview without a new spin or commit', async () => {
  await ready();
  fireEvent.change(screen.getByLabelText('Кому выдаём'), { target: { value: '' } });
  expect(screen.getByRole('button', { name: 'Зафиксировать пенальти' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Выбрать' })).toBeDisabled();
  await selectPupil();
  expect(screen.getByRole('button', { name: 'Выбрать' })).toBeEnabled();
  expect(call.mock.calls.filter(([path = '']) => path.endsWith('/spin'))).toHaveLength(1);
});

test('own idea has no automatic requests and fixation uses the signed custom preview', async () => {
  render(<PenaltyMiniApp />);
  await selectPupil();
  fireEvent.click(screen.getByRole('button', { name: 'Своё задание' }));
  const field = screen.getByRole('textbox', { name: /Как ученик отработает/ });
  expect(screen.getByRole('button', { name: 'Зафиксировать пенальти' })).toBeDisabled();
  fireEvent.change(field, { target: { value: 'Помочь подготовить аудиторию' } });
  expect(screen.getByRole('button', { name: 'Зафиксировать пенальти' })).toBeEnabled();
  expect(call.mock.calls.some(([path = '']) => /spin|custom-preview|commit/.test(path))).toBe(false);
  call.mockImplementation(async (path = '') => {
    if (path.endsWith('/custom-preview')) return { task: { title: 'Моя идея' }, draft_token: 'signed-custom' };
    penalty.workoff_status = 'in_workoff'; session = activeSession();
    return response();
  });
  fireEvent.click(screen.getByRole('button', { name: 'Зафиксировать пенальти' }));
  await waitFor(() => expect(call).toHaveBeenCalledWith('/penalties/1/commit', { draft_token: 'signed-custom' }));
  expect(call).toHaveBeenCalledWith('/penalties/1/custom-preview', { description: 'Помочь подготовить аудиторию' });
});

test('the platform cannot mount a cached identity before Telegram authorization completes', async () => {
  window.history.replaceState({}, '', '/#/');
  let rejectLogin;
  initializeMiniApp.mockImplementation(() => new Promise((_, reject) => { rejectLogin = reject; }));
  render(<PenaltyMiniApp renderPlatform={() => <h1>Чужой аккаунт</h1>} />);
  expect(screen.queryByText('Чужой аккаунт')).not.toBeInTheDocument();
  await act(async () => rejectLogin(new Error('Доступ закрыт')));
  expect(screen.getByRole('alert')).toHaveTextContent('Доступ закрыт');
  expect(screen.queryByText('Чужой аккаунт')).not.toBeInTheDocument();
});

test('reel has bounded gentle ticks only while spinning and cleans up on exit', () => {
  jest.useFakeTimers();
  window.matchMedia.mockReturnValue({ matches: false });
  const sdk = { HapticFeedback: { selectionChanged: jest.fn() } };
  const { rerender, unmount } = render(<Roulette catalog={catalog} sdk={sdk} spinning={false} />);
  act(() => jest.advanceTimersByTime(300));
  expect(sdk.HapticFeedback.selectionChanged).not.toHaveBeenCalled();
  rerender(<Roulette catalog={catalog} sdk={sdk} spinning />);
  act(() => jest.advanceTimersByTime(1050));
  expect(sdk.HapticFeedback.selectionChanged).toHaveBeenCalledTimes(6);
  act(() => jest.advanceTimersByTime(2000));
  expect(sdk.HapticFeedback.selectionChanged).toHaveBeenCalledTimes(6);
  unmount();
  act(() => jest.advanceTimersByTime(2000));
  expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers();
});

test('reduced-motion disables rolling ticks and unsupported haptics never throw', () => {
  jest.useFakeTimers();
  const sdk = { HapticFeedback: { selectionChanged: jest.fn(), impactOccurred: () => { throw new Error('unsupported'); } } };
  const { unmount } = render(<Roulette catalog={catalog} sdk={sdk} spinning />);
  act(() => jest.advanceTimersByTime(2000));
  expect(sdk.HapticFeedback.selectionChanged).not.toHaveBeenCalled();
  expect(() => playHaptic(sdk, 'impactOccurred', 'light')).not.toThrow();
  expect(() => playHaptic(null, 'impactOccurred', 'light')).not.toThrow();
  unmount();
  jest.useRealTimers();
});
