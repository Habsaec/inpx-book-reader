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
  it('shows «Прочитано N из M» and opens the next unread volume', () => {
    const onOpenSeriesNext = vi.fn();
    renderSeries({
      seriesProgress: { total: 15, read: 0, next: { id: '6:93307', title: 'Некромант', seriesNo: '1' }, numbers: [] },
      onOpenSeriesNext,
    });
    expect(screen.getByText('Прочитано 0 из 15')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Начать читать/ }));
    expect(onOpenSeriesNext).toHaveBeenCalledWith('6:93307');
  });

  it('says «Читать следующую» mid-series and «Серия прочитана» when done', () => {
    const { rerender } = renderSeries({
      seriesProgress: { total: 4, read: 2, next: { id: 'b3', title: 'Три', seriesNo: '3' }, numbers: [] },
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
        seriesProgress={{ total: 4, read: 4, next: null, numbers: [] }}
      />,
    );
    expect(screen.getByText('Серия прочитана')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Читать следующую/ })).toBeNull();
  });

  it('hides the block without progress (older server) or for a single-volume series', () => {
    renderSeries({ seriesProgress: null });
    expect(screen.queryByText(/Прочитано/)).toBeNull();
    cleanup();
    renderSeries({ seriesProgress: { total: 1, read: 0, next: { id: 'x', title: 'X', seriesNo: '' }, numbers: [] } });
    expect(screen.queryByText(/Прочитано/)).toBeNull();
  });
});

describe('CatalogDrilldownPanel: mark read up to volume N', () => {
  it('offers numbered volumes and sends the picked one', async () => {
    const onMarkSeriesReadUpTo = vi.fn(() => Promise.resolve());
    renderSeries({
      seriesProgress: { total: 3, read: 0, next: { id: 'b1', title: 'Один', seriesNo: '1' }, numbers: [1, 2, 3] },
      onOpenSeriesNext: vi.fn(),
      onMarkSeriesReadUpTo,
    });
    fireEvent.change(screen.getByLabelText('Прочитаны тома до'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Отметить' }));
    expect(onMarkSeriesReadUpTo).toHaveBeenCalledWith(2);
  });
});
