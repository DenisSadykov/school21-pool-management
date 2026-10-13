import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Navbar from './Navbar';
import { api } from '../api';

jest.mock('../api', () => ({
  api: { get: jest.fn() },
  clearSession: jest.fn(),
  POOLS_CHANGED_EVENT: 'pools-changed',
}));

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue({ id: 1, name: 'Бассейн октября' });
});

async function renderNavbar() {
  render(
    <MemoryRouter>
      <Navbar user={{ id: 1, nick: 'lead', role: 'team_lead' }} setUser={jest.fn()}
        theme="light" onThemeToggle={jest.fn()} />
      <button type="button">Другая кнопка</button>
    </MemoryRouter>,
  );
  await screen.findByText('Бассейн октября');
  return screen.getByRole('button', { name: /@lead/ });
}

it('exposes a stable dropdown relationship and expanded state', async () => {
  const trigger = await renderNavbar();
  const dropdownId = trigger.getAttribute('aria-controls');
  expect(dropdownId).toBeTruthy();
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(trigger);
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  expect(document.getElementById(dropdownId)).toContainElement(screen.getByRole('button', { name: 'Личный кабинет' }));
  fireEvent.click(trigger);
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(trigger);
  expect(trigger).toHaveAttribute('aria-controls', dropdownId);
});

it('closes on Escape from a dropdown control and restores focus to its trigger', async () => {
  const trigger = await renderNavbar();
  fireEvent.click(trigger);
  const profileButton = screen.getByRole('button', { name: 'Личный кабинет' });
  profileButton.focus();
  expect(profileButton).toHaveFocus();
  fireEvent.keyDown(profileButton, { key: 'Escape' });
  expect(screen.queryByRole('button', { name: 'Личный кабинет' })).not.toBeInTheDocument();
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(trigger).toHaveFocus();
});

it('ignores other keys and leaves focus alone when Escape is pressed after closing', async () => {
  const trigger = await renderNavbar();
  fireEvent.click(trigger);
  fireEvent.keyDown(document, { key: 'ArrowDown' });
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const outside = screen.getByRole('button', { name: 'Другая кнопка' });
  fireEvent.mouseDown(outside);
  outside.focus();
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  fireEvent.keyDown(outside, { key: 'Escape' });
  expect(outside).toHaveFocus();
});

it('keeps profile navigation closing the dropdown', async () => {
  const trigger = await renderNavbar();
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('button', { name: 'Личный кабинет' }));
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('button', { name: 'Личный кабинет' })).not.toBeInTheDocument();
});
