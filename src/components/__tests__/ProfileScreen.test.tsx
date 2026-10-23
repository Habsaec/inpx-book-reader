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
        colorSource="app"
        onChangeColorSource={vi.fn()}
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
  it('lists settings sections and opens «Подключение» with who is signed in', () => {
    renderSettings();
    const connection = screen.getByRole('button', { name: /Подключение/ });
    expect(connection.textContent).toContain('Подключён · 192.168.1.30:3000');
    fireEvent.click(connection);
    expect(screen.getByRole('heading', { name: 'Сервер' })).toBeTruthy();
    expect(screen.getByText('Вы вошли как')).toBeTruthy();
    expect(screen.getByText('http://192.168.1.30:3000')).toBeTruthy();
    expect(screen.queryByLabelText('Адрес сервера')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Сменить сервер или аккаунт' }));
    expect(screen.getByDisplayValue('http://192.168.1.30:3000')).toBeTruthy();
    expect(document.querySelectorAll('.inpx-skeleton-pulse')).toHaveLength(0);
  });

  it('shows the login form when not connected', () => {
    renderSettings({ serverConfig: { ...serverConfig, connectionStatus: 'disconnected' } });
    fireEvent.click(screen.getByRole('button', { name: /Подключение/ }));
    expect(screen.getByLabelText('Адрес сервера')).toBeTruthy();
    expect(screen.queryByText('Вы вошли как')).toBeNull();
  });

  it('does not insert a loading placeholder that pushes the form down during connect', () => {
    renderSettings({
      isOnline: false,
      loading: true,
      serverConfig: { ...serverConfig, connectionStatus: 'testing' },
    });
    expect(screen.getByText('Подключение к серверу…')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Подключение/ }));
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

  it('opens the matching «Мои книги» collection from a stat', () => {
    const onOpenLibrary = vi.fn();
    renderSettings({ profile, loading: false, onOpenLibrary });
    fireEvent.click(screen.getByRole('button', { name: /34\s*Прочитано/ }));
    expect(onOpenLibrary).toHaveBeenCalledWith('read');
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
    const bookmarks = screen.getByRole('button', { name: /Закладки/ });
    expect(bookmarks.textContent).toContain('0');
  });
});
