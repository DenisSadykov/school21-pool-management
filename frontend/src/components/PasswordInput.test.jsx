import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import PasswordInput from './PasswordInput';

test('shows and hides the entered value without submitting the form', () => {
  const submit = jest.fn();
  render(<form onSubmit={submit}><PasswordInput label="Пароль" value="example123" onChange={() => {}} /></form>);
  const input = screen.getByLabelText('Пароль');
  expect(input).toHaveAttribute('type', 'password');
  fireEvent.click(screen.getByRole('button', { name: 'Показать пароль: Пароль' }));
  expect(input).toHaveAttribute('type', 'text');
  expect(input).toHaveValue('example123');
  expect(screen.getByRole('button', { name: 'Скрыть пароль: Пароль' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Скрыть пароль: Пароль' }));
  expect(input).toHaveAttribute('type', 'password');
  expect(submit).not.toHaveBeenCalled();
});

test('hides the value on window blur and when the field is cleared', () => {
  const { rerender } = render(<PasswordInput label="Пароль" value="example123" onChange={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Показать пароль: Пароль' }));
  fireEvent(window, new Event('blur'));
  expect(screen.getByLabelText('Пароль')).toHaveAttribute('type', 'password');
  fireEvent.click(screen.getByRole('button', { name: 'Показать пароль: Пароль' }));
  rerender(<PasswordInput label="Пароль" value="" onChange={() => {}} />);
  expect(screen.getByLabelText('Пароль')).toHaveAttribute('type', 'password');
});

test('visibility is independent for different password fields', () => {
  render(<><PasswordInput label="Текущий пароль" value="current123" onChange={() => {}} /><PasswordInput label="Новый пароль" value="next12345" onChange={() => {}} /></>);
  fireEvent.click(screen.getByRole('button', { name: 'Показать пароль: Новый пароль' }));
  expect(screen.getByLabelText('Новый пароль')).toHaveAttribute('type', 'text');
  expect(screen.getByLabelText('Текущий пароль')).toHaveAttribute('type', 'password');
});
