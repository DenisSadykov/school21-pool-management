import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PenaltyMiniApp, { formatCountdown } from './PenaltyMiniApp';
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
});

async function ready() {
  render(<PenaltyMiniApp />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Зафиксировать пенальти' })).toBeEnabled());
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
  expect(screen.getByRole('button', { name: 'Выдать другое' })).toBeEnabled();
  expect(call.mock.calls.some(([path = '']) => path.endsWith('/commit'))).toBe(false);
});

test('reroll only requests another preview', async () => {
  await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Выдать другое' }));
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
  expect(await screen.findByRole('button', { name: 'Выполнено — следующее' })).toBeInTheDocument();
  expect(call.mock.calls.some(([path = '']) => path.endsWith('/spin'))).toBe(false);
  expect(screen.getByText('Осталось из 2 часов')).toBeInTheDocument();
});

test('short task uses completion endpoint instead of finishing penalty', async () => {
  penalty.workoff_status = 'in_workoff'; session = activeSession();
  render(<PenaltyMiniApp />);
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
  await waitFor(() => expect(screen.getByRole('button', { name: 'Зафиксировать пенальти' })).toBeEnabled());
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
