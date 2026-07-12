import React from 'react';
import { initLocalDb, loadLibrarySnapshot, persistLibrarySnapshot, setFavoriteAuthors, setFavoriteSeries } from '../lib/localDb';
import { hydrateAppSettings } from '../lib/appSettings';
import { hydrateOfflineReaderStore } from '../lib/offlineReaderStore';
import type { Book, ReadingProgress, Bookmark, Highlight, Shelf } from '../types';

export interface LocalLibraryState {
  ready: boolean;
  books: Book[];
  progressList: ReadingProgress[];
  bookmarks: Bookmark[];
  highlights: Highlight[];
  shelves: Shelf[];
  favoriteAuthors: string[];
  favoriteSeries: string[];
}

export function useLocalLibrary(): LocalLibraryState & {
  setBooks: React.Dispatch<React.SetStateAction<Book[]>>;
  setProgressList: React.Dispatch<React.SetStateAction<ReadingProgress[]>>;
  setBookmarks: React.Dispatch<React.SetStateAction<Bookmark[]>>;
  setHighlights: React.Dispatch<React.SetStateAction<Highlight[]>>;
  setShelves: React.Dispatch<React.SetStateAction<Shelf[]>>;
  setFavoriteAuthors: React.Dispatch<React.SetStateAction<string[]>>;
  setFavoriteSeries: React.Dispatch<React.SetStateAction<string[]>>;
} {
  const [ready, setReady] = React.useState(false);
  const [books, setBooks] = React.useState<Book[]>([]);
  const [progressList, setProgressList] = React.useState<ReadingProgress[]>([]);
  const [bookmarks, setBookmarks] = React.useState<Bookmark[]>([]);
  const [highlights, setHighlights] = React.useState<Highlight[]>([]);
  const [shelves, setShelves] = React.useState<Shelf[]>([]);
  const [favoriteAuthors, setFavoriteAuthors] = React.useState<string[]>([]);
  const [favoriteSeries, setFavoriteSeries] = React.useState<string[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      await initLocalDb();
      await hydrateAppSettings();
      await hydrateOfflineReaderStore();
      const snap = await loadLibrarySnapshot();
      if (cancelled) return;
      setBooks(snap.books);
      setProgressList(snap.progress);
      setBookmarks(snap.bookmarks);
      setHighlights(snap.highlights);
      setShelves(snap.shelves);
      setFavoriteAuthors(snap.favoriteAuthors);
      setFavoriteSeries(snap.favoriteSeries);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistTimer = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!ready) return;
    if (persistTimer.current) window.clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(() => {
      void persistLibrarySnapshot({ books, progress: progressList, bookmarks, highlights, shelves });
    }, 400);
    return () => {
      if (persistTimer.current) window.clearTimeout(persistTimer.current);
    };
  }, [ready, books, progressList, bookmarks, highlights, shelves]);

  React.useEffect(() => {
    if (!ready) return;
    void setFavoriteAuthors(favoriteAuthors);
    void setFavoriteSeries(favoriteSeries);
  }, [ready, favoriteAuthors, favoriteSeries]);

  return {
    ready,
    books,
    progressList,
    bookmarks,
    highlights,
    shelves,
    favoriteAuthors,
    favoriteSeries,
    setBooks,
    setProgressList,
    setBookmarks,
    setHighlights,
    setShelves,
    setFavoriteAuthors,
    setFavoriteSeries,
  };
}
