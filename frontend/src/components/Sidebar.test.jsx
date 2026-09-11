import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from './Sidebar';

jest.mock('../useIsMobile', () => () => false);

describe('Sidebar tribe scripts relationship', () => {
  it('uses a tribe-colored connector instead of a document icon', () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Sidebar
          user={{ role: 'tribe_master', tribe: 'Ленты' }}
          mobileOpen={false}
          onMobileClose={jest.fn()}
        />
      </MemoryRouter>,
    );

    const scriptsLink = screen.getByRole('link', { name: 'Скрипты трайба' });
    expect(scriptsLink).toHaveClass('tribe-child');
    expect(scriptsLink.querySelector('.tribe-child-connector.tribe-ribbons')).toBeInTheDocument();
    expect(scriptsLink.querySelector('svg')).not.toBeInTheDocument();
  });

  it('shows My Tribe but keeps scripts restricted for a tribe assistant', () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Sidebar
          user={{ role: 'tribe_assistant', tribe: 'Короны' }}
          mobileOpen={false}
          onMobileClose={jest.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Мой трайб' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Скрипты трайба' })).not.toBeInTheDocument();
  });
});
