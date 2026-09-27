// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import BookDetailsSheet from '../BookDetailsSheet';
import type { Book, ServerConfig } from '../../../types';
import { fetchBookReviewHtml } from '../../../lib/inpxClient';

vi.mock('../../../lib/coverCache', () => ({
  peekCoverMemory: () => null,
  resolveCoverUrl: async () => null,
}));

vi.mock('../../../lib/inpxClient', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/inpxClient')>('../../../lib/inpxClient');
  return {
    ...actual,
    fetchBookDetails: vi.fn(async () => ({ annotation: '', annotationIsHtml: false })),
    fetchBookMeta: vi.fn(async () => null),
    fetchBookReviewHtml: vi.fn(async () => ''),
    fetchFacetBooks: vi.fn(async (_config: unknown, facet: string) => {
      if (facet === 'series') {
        return {
          items: [{
            id: 'next',
            title: 'Следующий том',
            authors: 'Стив Кавана',
            series: 'эди кармайкл',
            seriesNo: '3',
            ext: 'fb2',
          }],
          total: 3,
          page: 1,
          pageSize: 24,
        };
      }
      return {
        items: [{ id: 'other', title: 'Другая книга', authors: 'Стив Кавана', ext: 'fb2' }],
        total: 1,
        page: 1,
        pageSize: 24,
      };
    }),
  };
});

const serverConfig: ServerConfig = {
  url: 'http://192.168.1.30:3000',
  connectionStatus: 'connected',
};

const book: Book = {
  id: 'deal',
  title: 'Сделка',
  author: 'Стив Кавана',
  ext: 'fb2',
  series: 'эди кармайкл',
  seriesDisplay: 'Эди Кармайкл',
  seriesNo: 2,
  year: 2019,
  size: 1_400_000,
  rating: 4,
  lang: 'ru',
  genresDisplay: ['Триллер', 'Детектив'],
  description: 'Короткое описание.',
};

afterEach(() => {
  cleanup();
});

describe('BookDetailsSheet', () => {
  it('shows the book page with facts, annotation, and two actions', async () => {
    render(
      <BookDetailsSheet
        book={book}
        onClose={vi.fn()}
        serverConfig={serverConfig}
        isServerConnected
        downloadedBookIds={[]}
        downloadingId={null}
        downloadError={null}
        onDownload={vi.fn()}
        onOpenBook={vi.fn()}
        isAppDark={false}
        onOpenAuthor={vi.fn()}
        onOpenSeries={vi.fn()}
        onAddToShelf={vi.fn()}
        onToggleBookmark={vi.fn()}
      />,
    );

    expect(await screen.findByRole('heading', { name: 'Сделка' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Автор: Стив Кавана' })).toBeTruthy();
    expect(screen.getByText('О книге')).toBeTruthy();
    expect(screen.getByText('Короткое описание.')).toBeTruthy();
    expect(screen.getByText('2019')).toBeTruthy();
    expect(screen.getByText('из 5')).toBeTruthy();
    expect(screen.getByText('Триллер, Детектив · Русский · FB2')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Скачать' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'На полку' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'В избранное' })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Далее в серии' })).toBeTruthy();
    expect(screen.getAllByText('Следующий том').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Другие книги автора' })).toBeTruthy();
    expect(screen.getAllByText('Другая книга').length).toBeGreaterThan(0);
    expect(screen.queryByText(/4 из 5/)).toBeNull();
  });

  it('shows each review as a card with name and date', async () => {
    vi.mocked(fetchBookReviewHtml).mockResolvedValueOnce(
      '<div class="flib-reviews"><div class="flib-review-item"><p class="flib-review-meta"><strong>Анна</strong> <span class="muted">1609459200</span></p><div class="flib-review-text"><p>Сильно.</p></div></div></div>',
    );
    render(
      <BookDetailsSheet
        book={book}
        onClose={vi.fn()}
        serverConfig={serverConfig}
        isServerConnected
        downloadedBookIds={[]}
        downloadingId={null}
        downloadError={null}
        onDownload={vi.fn()}
        onOpenBook={vi.fn()}
        isAppDark={false}
        onOpenAuthor={vi.fn()}
        onOpenSeries={vi.fn()}
      />,
    );

    expect(await screen.findByRole('heading', { name: /Отзывы/ })).toBeTruthy();
    expect(screen.getByText('Анна')).toBeTruthy();
    expect(screen.getByText('1 января 2021')).toBeTruthy();
    expect(screen.getByText('Сильно.')).toBeTruthy();
  });
});
