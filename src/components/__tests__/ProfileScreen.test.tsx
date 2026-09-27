// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import ProfileScreen from '../ProfileScreen';
import { SnackbarProvider } from '../../ui/Snackbar';
import { DialogProvider } from '../../ui/Dialog';
import type { ServerConfig } from '../../types';
import type { InpxProfile } from '../../lib/inpxClient';

const profile: InpxProfile = {
  user: { username: 'Habsaec', role: 'admin' },
  userStats: {
    readingCount: 4,
    bookmarkCount: 0,
    readBooksCount: 34,
    favoriteAuthorsCount: 2,
    favoriteSeriesCount: 1,
    shelvesCount: 3,
    readerBookmarksCount: 8,
    readerAnnotationsCount: 0,
    createdAt: '2024-03-02 12:00:00',
  },
  recentBooks: [],
  readerBookmarks: [],
  readerAnnotations: [],
};

const serverConfig: ServerConfig = {
  url: 'http://192.168.1.30:3000',
  username: 'Habsaec',
  password: '',
  connectionStatus: 'connected',
};

function renderSettings(overrides: Partial<React.ComponentProps<typeof ProfileScreen>> = {}) {
  return render(
    <DialogProvider>
    <SnackbarProvider>
      <ProfileScreen
        profile={null}
        loading
        error=""
        isOnline
        serverConfig={serverConfig}
        onChangeServerConfig={vi.fn()}
        onTestConnection={vi.fn()}
        onPairingLogin={vi.fn()}
        storageDirectory={null}
        onChangeStorageDirectory={vi.fn()}
        appearance="auto"
        onChangeAppearance={vi.fn()}
        colorSource="server"
        onChangeColorSource={vi.fn()}
        useServerBackground
        onChangeUseServerBackground={vi.fn()}
        hasServerBackground={false}
        isAppDark={false}
        einkMode="off"
        onChangeEinkMode={vi.fn()}
        einkDetected={false}
        localBookCount={46}
        localInProgressCount={3}
        {...overrides}
      />
    </SnackbarProvider>
    </DialogProvider>,
  );
}

afterEach(() => {
  cleanup();
});

describe('ProfileScreen', () => {
  it('keeps the server form visible while profile is still loading', () => {
    renderSettings();
    expect(screen.getByRole('heading', { name: 'Сервер' })).toBeTruthy();
    expect(screen.getByLabelText('Адрес сервера')).toBeTruthy();
    expect(screen.getByDisplayValue('http://192.168.1.30:3000')).toBeTruthy();
    expect(document.querySelectorAll('.inpx-skeleton-pulse')).toHaveLength(0);
  });

  it('does not insert a loading placeholder that pushes the form down during connect', () => {
    renderSettings({
      isOnline: false,
      loading: true,
      serverConfig: { ...serverConfig, connectionStatus: 'testing' },
    });
    expect(screen.getByText('Подключение к серверу…')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Сервер' })).toBeTruthy();
    expect(document.querySelectorAll('.inpx-skeleton-pulse')).toHaveLength(0);
  });

  it('shows library stats from the profile next to the local counts', () => {
    renderSettings({ profile, loading: false });
    expect(screen.getByText('Habsaec')).toBeTruthy();
    expect(screen.getByText('Администратор')).toBeTruthy();
    expect(screen.getByText('в библиотеке с марта 2024')).toBeTruthy();
    const stats = screen.getByRole('button', { name: 'Статистика' });
    expect(stats.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(stats);
    expect(stats.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('34')).toBeTruthy();
    expect(screen.getByText('Прочитано')).toBeTruthy();
    expect(screen.getByText('8')).toBeTruthy();
    expect(screen.getByText('Закладки')).toBeTruthy();
  });

  it('keeps a zero bookmark count visible', () => {
    renderSettings({
      profile: {
        ...profile,
        userStats: { ...profile.userStats, readerBookmarksCount: 0 },
      },
      loading: false,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Статистика' }));
    const bookmarks = screen.getByRole('row', { name: /Закладки/ });
    expect(bookmarks.textContent).toContain('0');
  });
});
