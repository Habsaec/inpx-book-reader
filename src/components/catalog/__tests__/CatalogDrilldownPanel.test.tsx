// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import CatalogDrilldownPanel from '../CatalogDrilldownPanel';
import type { ServerConfig } from '../../../types';

const serverConfig: ServerConfig = { url: 'http://192.168.1.30:3000', connectionStatus: 'connected' };

function renderSeries(extra: Partial<React.ComponentProps<typeof CatalogDrilldownPanel>> = {}) {
  return render(
    <CatalogDrilldownPanel
      selectedAuthor={null}
      selectedSeries="дорсай"
      selectedSeriesDisplay="Дорсай"
      selectedSubgenre={null}
      authorOutsideSeries={false}
      authorGrouped={null}
      currentBooksCount={15}
      isServerBrowse
      isAppDark={false}
      serverConfig={serverConfig}
      favoriteAuthors={[]}
      favoriteSeries={[]}
      onDrillDownBack={vi.fn()}
      showBackBar={false}
      onToggleFavoriteAuthor={vi.fn()}
      onToggleFavoriteSeries={vi.fn()}
      {...extra}
    />,
  );
}

afterEach(() => {
  cleanup();
});

describe('CatalogDrilldownPanel series progress', () => {
  it('shows «Прочитано N из M» and no button before anything is read', () => {
    renderSeries({
      seriesProgress: { total: 15, read: 0, next: { id: '6:93307', title: 'Некромант', seriesNo: '1', prevRead: false }, numbers: [], want: false, current: null },
      onOpenSeriesNext: vi.fn(),
    });
    expect(screen.getByText('Прочитано 0 из 15')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Читать следующую|Продолжить/ })).toBeNull();
  });

  it('says «Читать следующую» mid-series and «Серия прочитана» when done', () => {
    const { rerender } = renderSeries({
      seriesProgress: { total: 4, read: 2, next: { id: 'b3', title: 'Три', seriesNo: '3', prevRead: true }, numbers: [], want: false, current: null },
      onOpenSeriesNext: vi.fn(),
    });
    expect(screen.getByRole('button', { name: /Читать следующую.*3\. Три/ })).toBeTruthy();

    rerender(
      <CatalogDrilldownPanel
        selectedAuthor={null}
        selectedSeries="дорсай"
        selectedSubgenre={null}
        authorOutsideSeries={false}
        authorGrouped={null}
        currentBooksCount={4}
        isServerBrowse
        isAppDark={false}
        serverConfig={serverConfig}
        favoriteAuthors={[]}
        favoriteSeries={[]}
        onDrillDownBack={vi.fn()}
        showBackBar={false}
        onToggleFavoriteAuthor={vi.fn()}
        onToggleFavoriteSeries={vi.fn()}
        seriesProgress={{ total: 4, read: 4, next: null, numbers: [], want: false, current: null }}
      />,
    );
    expect(screen.getByText('Серия прочитана')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Читать следующую/ })).toBeNull();
  });

  it('hides the block without progress (older server) or for a single-volume series', () => {
    renderSeries({ seriesProgress: null });
    expect(screen.queryByText(/Прочитано/)).toBeNull();
    cleanup();
    renderSeries({ seriesProgress: { total: 1, read: 0, next: { id: 'x', title: 'X', seriesNo: '', prevRead: false }, numbers: [], want: false, current: null } });
    expect(screen.queryByText(/Прочитано/)).toBeNull();
  });
});

describe('CatalogDrilldownPanel: series actions', () => {
  it('shows want → read → favorite → shelf in the book sheet order', () => {
    const onToggleSeriesWant = vi.fn();
    const onToggleSeriesRead = vi.fn();
    const onToggleFavoriteSeries = vi.fn();
    renderSeries({
      seriesProgress: { total: 3, read: 1, next: { id: 'b2', title: 'Два', seriesNo: '2', prevRead: false }, numbers: [], want: true, current: null },
      onToggleSeriesWant,
      onToggleSeriesRead,
      onToggleFavoriteSeries,
      onAddSeriesToShelf: vi.fn(),
      shelves: [],
    });
    const labels = ['Отложено', 'В прочитанные', 'В избранное', 'На полку'];
    const buttons = labels.map((name) => screen.getByRole('button', { name }));
    for (let i = 1; i < buttons.length; i++) {
      expect(buttons[i - 1].compareDocumentPosition(buttons[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);
    fireEvent.click(buttons[2]);
    expect(onToggleSeriesWant).toHaveBeenCalled();
    expect(onToggleSeriesRead).toHaveBeenCalled();
    expect(onToggleFavoriteSeries).toHaveBeenCalledWith('дорсай');
  });

  it('hides «Хочу прочитать» for a fully read series', () => {
    renderSeries({
      seriesProgress: { total: 2, read: 2, next: null, numbers: [], want: false, current: null },
      onToggleSeriesWant: vi.fn(),
      onToggleSeriesRead: vi.fn(),
    });
    expect(screen.queryByRole('button', { name: 'Хочу прочитать' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Прочитана' })).toBeTruthy();
  });
});

describe('CatalogDrilldownPanel: started volume', () => {
  it('offers «Продолжить» for the volume being read', () => {
    const onOpenSeriesNext = vi.fn();
    renderSeries({
      seriesProgress: {
        total: 18, read: 0, next: { id: 'v1', title: 'Один', seriesNo: '1', prevRead: false }, numbers: [], want: false,
        current: { id: 'v4', title: 'Четыре', seriesNo: '4', progress: 8.03 },
      },
      onOpenSeriesNext,
    });
    fireEvent.click(screen.getByRole('button', { name: /Продолжить.*4\. Четыре.*8%/ }));
    expect(onOpenSeriesNext).toHaveBeenCalledWith('v4');
    expect(screen.queryByRole('button', { name: /Читать следующую/ })).toBeNull();
  });
});
