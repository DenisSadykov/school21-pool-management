import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ThemeToggle from './ThemeToggle';

describe('ThemeToggle', () => {
  test('offers dark mode from the light theme', () => {
    const onToggle = jest.fn();
    render(<ThemeToggle theme="light" onToggle={onToggle} />);

    fireEvent.click(screen.getByRole('button', { name: 'Тёмная тема' }));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  test('offers light mode from the dark theme', () => {
    render(<ThemeToggle theme="dark" onToggle={() => {}} compact />);

    expect(screen.getByRole('button', { name: 'Светлая тема' })).toBeInTheDocument();
  });
});
