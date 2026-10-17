import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import MiniAppNav from './MiniAppNav';

test.each(['issue', 'working', 'platform'])('dock retains labels, routes and one selected section: %s', (view) => {
  render(<MiniAppNav view={view} count={12} />);
  const links = screen.getAllByRole('link');
  expect(screen.getByRole('navigation', { name: 'Меню мини-апа' })).toBeInTheDocument();
  expect(links.map((link) => link.getAttribute('href'))).toEqual([
    '/miniapp/penalties', '/miniapp/penalties?view=working', '/miniapp/platform#/',
  ]);
  expect(links.filter((link) => link.getAttribute('aria-current') === 'page')).toHaveLength(1);
  expect(screen.getByRole('link', { name: 'Рулетка' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '12 Отрабатывают сейчас' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Платформа' })).toBeInTheDocument();
});

test('dock navigates inside the miniapp without changing route targets', () => {
  const onNavigate = jest.fn();
  render(<MiniAppNav view="issue" onNavigate={onNavigate} />);
  expect(fireEvent.click(screen.getByRole('link', { name: 'Платформа' }))).toBe(false);
  expect(onNavigate).toHaveBeenCalledWith('platform');
});

test('busy dock blocks all navigation until the action has finished', () => {
  const onNavigate = jest.fn();
  render(<MiniAppNav view="issue" busy onNavigate={onNavigate} />);
  for (const link of screen.getAllByRole('link')) {
    expect(link).toHaveAttribute('aria-disabled', 'true');
    expect(fireEvent.click(link)).toBe(false);
  }
  expect(onNavigate).not.toHaveBeenCalled();
});

test('dock preserves explicit same-window fallback links', () => {
  const onNavigate = jest.fn(() => false);
  render(<MiniAppNav view="issue" onNavigate={onNavigate} />);
  const platform = screen.getByRole('link', { name: 'Платформа' });
  expect(platform).not.toHaveAttribute('target');
  expect(fireEvent.click(platform)).toBe(true);
});
