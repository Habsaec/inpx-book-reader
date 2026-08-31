import React from 'react';
import { Search, X } from 'lucide-react';
import { fetchSearchSuggestions, type SearchSuggestions } from '../lib/inpxClient';
import { theme } from '../lib/appTheme';
import { textStyles, touchMin, radii, motion } from '../ui/tokens';
import type { ServerConfig } from '../types';
import { useSearchHistory } from '../hooks/useSearchHistory';

interface HomeSearchBarProps {
  serverConfig: ServerConfig;
  isOnline: boolean;
  onSubmitSearch: (query: string) => void;
  onPickAuthor: (name: string) => void;
  onPickSeries: (name: string) => void;
  onPickBook: (book: { id: string; title: string; authors?: string; authorsDisplay?: string }) => void;
}

export default function HomeSearchBar({
  serverConfig,
  isOnline,
  onSubmitSearch,
  onPickAuthor,
  onPickSeries,
  onPickBook,
}: HomeSearchBarProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const blurTimerRef = React.useRef<number | null>(null);
  const suggestSeqRef = React.useRef(0);
  const [query, setQuery] = React.useState('');
  const [focused, setFocused] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<SearchSuggestions>({
    books: [],
    authors: [],
    series: [],
  });
  const { history, addQuery, removeQuery, clearHistory } = useSearchHistory();

  React.useEffect(() => {
    return () => {
      if (blurTimerRef.current != null) window.clearTimeout(blurTimerRef.current);
    };
  }, []);

  React.useEffect(() => {
    if (!isOnline || !focused) {
      setSuggestions({ books: [], authors: [], series: [] });
      return;
    }
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions({ books: [], authors: [], series: [] });
      return;
    }
    const seq = ++suggestSeqRef.current;
    const timer = window.setTimeout(() => {
      void fetchSearchSuggestions(serverConfig, q)
        .then((data) => {
          if (seq !== suggestSeqRef.current) return;
          setSuggestions({
            books: Array.isArray(data.books) ? data.books : [],
            authors: Array.isArray(data.authors) ? data.authors : [],
            series: Array.isArray(data.series) ? data.series : [],
          });
        })
        .catch(() => {
          if (seq !== suggestSeqRef.current) return;
          setSuggestions({ books: [], authors: [], series: [] });
        });
    }, 280);
    return () => window.clearTimeout(timer);
  }, [focused, isOnline, query, serverConfig]);

  const showHistory = focused && query.trim().length === 0 && history.length > 0;
  const showSuggest =
    focused &&
    query.trim().length >= 2 &&
    (suggestions.authors.length > 0 || suggestions.series.length > 0 || suggestions.books.length > 0);

  const close = () => {
    setFocused(false);
    inputRef.current?.blur();
  };

  const submit = (raw?: string) => {
    const next = (raw ?? query).trim();
    if (!next) return;
    addQuery(next);
    setQuery('');
    close();
    onSubmitSearch(next);
  };

  return (
    <div className="relative">
      <form
        className="relative"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor="home-search" className="sr-only">Поиск книг, авторов и серий</label>
        <input
          id="home-search"
          ref={inputRef}
          type="search"
          enterKeyHint="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            } else if (e.key === 'Escape') {
              close();
            }
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            if (blurTimerRef.current != null) window.clearTimeout(blurTimerRef.current);
            blurTimerRef.current = window.setTimeout(() => {
              blurTimerRef.current = null;
              const active = document.activeElement;
              if (active && panelRef.current?.contains(active)) return;
              setFocused(false);
            }, 120);
          }}
          placeholder={isOnline ? 'Книга, автор или серия' : 'Поиск недоступен офлайн'}
          disabled={!isOnline}
          autoComplete="off"
          className={`w-full ${radii.button} pl-12 pr-20 py-3.5 text-sm ${theme.inputFocus} transition-[colors,box-shadow] duration-200 ease-out ${theme.input} disabled:opacity-60`}
        />
        <Search
          className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 ${theme.textMuted} pointer-events-none`}
          aria-hidden
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
          {query.length > 0 && (
            <button
              type="button"
              aria-label="Очистить поиск"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className={`${touchMin} inline-flex items-center justify-center rounded-full ${theme.textMuted} ${theme.focusRing} ${motion.press}`}
            >
              <X className="w-4 h-4" aria-hidden />
            </button>
          )}
          <button
            type="submit"
            aria-label="Искать"
            disabled={!isOnline || !query.trim()}
            className={`${touchMin} inline-flex items-center justify-center ${radii.button} ${theme.accentBg} text-white ${theme.focusRing} ${motion.press} disabled:opacity-50`}
          >
            <Search className="w-4 h-4" aria-hidden />
          </button>
        </div>
      </form>

      {showHistory ? (
        <div
          ref={panelRef}
          className={`absolute left-0 right-0 top-full mt-2 z-30 border overflow-hidden ${radii.lg} ${theme.dropdown} shadow-lg`}
        >
          <div className={`px-4 py-2.5 flex items-center justify-between ${textStyles.caption} ${theme.textMuted}`}>
            <span>Недавние запросы</span>
            <button
              type="button"
              onClick={clearHistory}
              className={`${touchMin} inline-flex items-center px-2 ${textStyles.captionBold} ${theme.accentText} ${radii.button} ${theme.focusRing}`}
            >
              Очистить
            </button>
          </div>
          {history.map((item) => (
            <div key={item} className={`flex items-center border-t border-[color:var(--app-border)] ${theme.dropdownItem}`}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => submit(item)}
                className={`flex-1 text-left px-4 min-h-12 flex items-center text-sm ${theme.focusRing}`}
              >
                {item}
              </button>
              <button
                type="button"
                aria-label={`Удалить запрос ${item}`}
                onClick={() => removeQuery(item)}
                className={`${touchMin} inline-flex items-center justify-center shrink-0 ${theme.chipButton} ${theme.focusRing}`}
              >
                <X className="w-3.5 h-3.5" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {showSuggest ? (
        <div
          ref={panelRef}
          className={`absolute left-0 right-0 top-full mt-2 z-30 border max-h-80 overflow-y-auto ${radii.lg} ${theme.dropdown} shadow-lg`}
        >
          {suggestions.authors.length > 0 ? (
            <>
              <div className={`px-4 py-2 ${textStyles.caption} ${theme.textMuted}`}>Авторы</div>
              {suggestions.authors.slice(0, 4).map((row) => (
                <button
                  key={`a-${row.name}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    addQuery(row.displayName || row.name);
                    setQuery('');
                    close();
                    onPickAuthor(row.name);
                  }}
                  className={`flex w-full items-baseline justify-between gap-2 text-left px-4 min-h-12 ${theme.dropdownItem} ${theme.focusRing}`}
                >
                  <span className="truncate text-sm">{row.displayName || row.name}</span>
                  {row.bookCount != null ? (
                    <span className={`shrink-0 ${textStyles.caption} ${theme.textMuted} tabular-nums`}>{row.bookCount}</span>
                  ) : null}
                </button>
              ))}
            </>
          ) : null}
          {suggestions.series.length > 0 ? (
            <>
              <div className={`px-4 py-2 ${textStyles.caption} ${theme.textMuted}`}>Серии</div>
              {suggestions.series.slice(0, 4).map((row) => (
                <button
                  key={`s-${row.name}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    addQuery(row.displayName || row.name);
                    setQuery('');
                    close();
                    onPickSeries(row.name);
                  }}
                  className={`flex w-full items-baseline justify-between gap-2 text-left px-4 min-h-12 ${theme.dropdownItem} ${theme.focusRing}`}
                >
                  <span className="truncate text-sm">{row.displayName || row.name}</span>
                  {row.bookCount != null ? (
                    <span className={`shrink-0 ${textStyles.caption} ${theme.textMuted} tabular-nums`}>{row.bookCount}</span>
                  ) : null}
                </button>
              ))}
            </>
          ) : null}
          {suggestions.books.length > 0 ? (
            <>
              <div className={`px-4 py-2 ${textStyles.caption} ${theme.textMuted}`}>Книги</div>
              {suggestions.books.slice(0, 5).map((book) => (
                <button
                  key={`b-${book.id}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setQuery('');
                    close();
                    onPickBook(book);
                  }}
                  className={`flex w-full flex-col justify-center text-left px-4 min-h-12 py-2 ${theme.dropdownItem} ${theme.focusRing}`}
                >
                  <span className="truncate text-sm">{book.title}</span>
                  {book.authorsDisplay || book.authors ? (
                    <span className={`truncate ${textStyles.caption} ${theme.textMuted}`}>
                      {book.authorsDisplay || book.authors}
                    </span>
                  ) : null}
                </button>
              ))}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
