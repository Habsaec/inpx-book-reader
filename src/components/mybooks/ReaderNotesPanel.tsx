import React from 'react';
import { ChevronLeft, ChevronRight, ClipboardCopy, Pencil, StickyNote, Trash2 } from 'lucide-react';
import { theme } from '../../lib/appTheme';
import type { LocalReaderAnnotationItem } from '../../lib/offlineReaderStore';
import type { ServerConfig } from '../../types';
import {
  ANNOTATION_COLOR_LABELS,
  ANNOTATION_COLOR_SWATCH,
  ANNOTATION_COLORS,
  annotationToBook,
  copyTextToClipboard,
  exportAnnotationsJson,
  exportAnnotationsMarkdown,
  filterAnnotationsByBook,
  filterAnnotationsByColor,
  formatAnnotationCopyText,
  type AnnotationColorFilter,
} from '../../lib/readerNotesUtils';
import EmptyState from '../../ui/EmptyState';
import { textStyles, touchMin, semantic } from '../../ui/tokens';
import { useSnackbar } from '../../ui/Snackbar';

interface ReaderNotesPanelProps {
  annotations: LocalReaderAnnotationItem[];
  serverConfig: ServerConfig;
  onOpenAnnotation: (bookId: string, cfi: string, book: ReturnType<typeof annotationToBook>) => void;
  onRemoveAnnotation?: (bookId: string, annId: number) => void | Promise<void>;
  onUpdateAnnotation?: (bookId: string, annId: number, patch: { note?: string; color?: string }) => void | Promise<void>;
}

export default function ReaderNotesPanel({
  annotations,
  serverConfig,
  onOpenAnnotation,
  onRemoveAnnotation,
  onUpdateAnnotation,
}: ReaderNotesPanelProps) {
  const snackbar = useSnackbar();
  const [colorFilter, setColorFilter] = React.useState<AnnotationColorFilter>('all');
  const [bookFilter, setBookFilter] = React.useState<string | 'all'>('all');
  const [focusIndex, setFocusIndex] = React.useState(0);
  const [editing, setEditing] = React.useState<LocalReaderAnnotationItem | null>(null);
  const [editNote, setEditNote] = React.useState('');

  const bookOptions = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const an of annotations) map.set(an.bookId, an.bookTitle);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'ru'));
  }, [annotations]);

  const filtered = React.useMemo(() => {
    const byBook = filterAnnotationsByBook(annotations, bookFilter);
    return filterAnnotationsByColor(byBook, colorFilter);
  }, [annotations, bookFilter, colorFilter]);

  React.useEffect(() => {
    setFocusIndex((i) => (filtered.length === 0 ? 0 : Math.min(i, filtered.length - 1)));
  }, [filtered.length, colorFilter]);

  const focused = filtered[focusIndex];

  const goPrev = () => setFocusIndex((i) => (filtered.length ? (i - 1 + filtered.length) % filtered.length : 0));
  const goNext = () => setFocusIndex((i) => (filtered.length ? (i + 1) % filtered.length : 0));

  const handleCopy = async (an: LocalReaderAnnotationItem) => {
    const ok = await copyTextToClipboard(formatAnnotationCopyText(an));
    snackbar.show(ok ? 'Скопировано' : 'Не удалось скопировать', undefined, ok ? 'success' : 'error');
  };

  const handleExport = async () => {
    if (!filtered.length) return;
    const ok = await copyTextToClipboard(exportAnnotationsMarkdown(filtered));
    snackbar.show(
      ok ? `Экспортировано ${filtered.length} заметок` : 'Не удалось экспортировать',
      undefined,
      ok ? 'success' : 'error',
    );
  };

  const handleExportJson = async () => {
    if (!filtered.length) return;
    const ok = await copyTextToClipboard(exportAnnotationsJson(filtered));
    snackbar.show(ok ? `JSON: ${filtered.length} заметок` : 'Не удалось экспортировать', undefined, ok ? 'success' : 'error');
  };

  const startEdit = (an: LocalReaderAnnotationItem) => {
    setEditing(an);
    setEditNote(an.note || '');
  };

  const saveEdit = () => {
    if (!editing || !onUpdateAnnotation) return;
    void onUpdateAnnotation(editing.bookId, editing.id, { note: editNote.trim() });
    setEditing(null);
  };

  if (!annotations.length) {
    return (
      <EmptyState
        icon={StickyNote}
        title="Нет заметок"
        description="Выделяйте текст в читалке и добавляйте заметки — они появятся здесь."
      />
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className={`shrink-0 px-3 py-2 border-b ${theme.header} space-y-2`}>
        {bookOptions.length > 1 && (
          <label className={`block ${textStyles.caption} ${theme.textMuted}`}>
            Книга
            <select
              value={bookFilter}
              onChange={(e) => setBookFilter(e.target.value as string | 'all')}
              className={`mt-1 w-full rounded-lg border px-2 py-1.5 ${textStyles.caption} ${theme.input}`}
            >
              <option value="all">Все книги</option>
              {bookOptions.map(([id, title]) => (
                <option key={id} value={id}>{title}</option>
              ))}
            </select>
          </label>
        )}
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setColorFilter('all')}
            className={`px-2.5 py-1 rounded-full ${textStyles.microBold} ${theme.focusRing} ${
              colorFilter === 'all' ? theme.accentMuted : `${theme.textMuted} ${theme.card}`
            }`}
          >
            Все ({annotations.length})
          </button>
          {ANNOTATION_COLORS.map((c) => {
            const count = annotations.filter((a) => a.color === c).length;
            if (!count) return null;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setColorFilter(c)}
                className={`px-2.5 py-1 rounded-full ${textStyles.microBold} flex items-center gap-1.5 ${theme.focusRing} ${
                  colorFilter === c ? theme.accentMuted : `${theme.textMuted} ${theme.card}`
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${ANNOTATION_COLOR_SWATCH[c]}`} aria-hidden />
                {ANNOTATION_COLOR_LABELS[c]} ({count})
              </button>
            );
          })}
        </div>

        {filtered.length > 1 && (
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={goPrev}
              className={`${touchMin} px-2 rounded-lg ${theme.card} ${theme.focusRing}`}
              aria-label="Предыдущая заметка"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className={`${textStyles.caption} ${theme.textMuted}`}>
              {focusIndex + 1} / {filtered.length}
            </span>
            <button
              type="button"
              onClick={goNext}
              className={`${touchMin} px-2 rounded-lg ${theme.card} ${theme.focusRing}`}
              aria-label="Следующая заметка"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => void handleExport()}
              className={`ml-auto px-3 py-1.5 rounded-lg ${textStyles.captionBold} ${theme.accentMuted} ${theme.focusRing}`}
            >
              MD
            </button>
            <button
              type="button"
              onClick={() => void handleExportJson()}
              className={`px-3 py-1.5 rounded-lg ${textStyles.captionBold} ${theme.accentMuted} ${theme.focusRing}`}
            >
              JSON
            </button>
          </div>
        )}
      </div>

      <ul className="flex-1 min-h-0 overflow-y-auto px-4 py-2">
        {filtered.length === 0 ? (
          <li className={`${textStyles.caption} ${theme.textMuted} text-center py-8`}>
            Нет заметок с выбранным цветом
          </li>
        ) : (
          filtered.map((an, idx) => {
            const swatch = ANNOTATION_COLOR_SWATCH[an.color as keyof typeof ANNOTATION_COLOR_SWATCH];
            const isFocused = idx === focusIndex;
            return (
              <li key={`${an.bookId}-${an.id}`} className={`border-b last:border-b-0 py-3 ${theme.divider}`}>
                <article
                  className={`${isFocused ? 'ring-2 ring-[var(--app-link)]/40 rounded-xl' : ''}`}
                >
                  <div className="flex gap-2">
                    <span
                      className={`w-1 shrink-0 rounded-full ${swatch ?? 'bg-yellow-400'}`}
                      aria-hidden
                    />
                    <div className="flex-1 min-w-0">
                      <p className={`${textStyles.bookTitle} text-sm truncate`}>{an.bookTitle}</p>
                      {an.text ? (
                        <p className={`${textStyles.body} mt-1 line-clamp-3`}>«{an.text}»</p>
                      ) : null}
                      {an.note ? (
                        <p className={`${textStyles.caption} ${theme.textMuted} mt-1 line-clamp-2`}>{an.note}</p>
                      ) : null}
                      <div className="flex flex-wrap gap-1 mt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setFocusIndex(idx);
                            onOpenAnnotation(an.bookId, an.cfi, annotationToBook(an, serverConfig));
                          }}
                          className={`px-2.5 py-1 rounded-lg ${textStyles.microBold} ${theme.accentMuted} ${theme.focusRing}`}
                        >
                          Открыть
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleCopy(an)}
                          className={`px-2.5 py-1 rounded-lg ${textStyles.microBold} ${theme.card} ${theme.focusRing} flex items-center gap-1`}
                        >
                          <ClipboardCopy className="w-3 h-3" aria-hidden />
                          Копировать
                        </button>
                        {onUpdateAnnotation ? (
                          <button
                            type="button"
                            onClick={() => startEdit(an)}
                            className={`px-2.5 py-1 rounded-lg ${textStyles.microBold} ${theme.card} ${theme.focusRing} flex items-center gap-1`}
                          >
                            <Pencil className="w-3 h-3" aria-hidden />
                            Изменить
                          </button>
                        ) : null}
                        {onRemoveAnnotation ? (
                          <button
                            type="button"
                            onClick={() => void onRemoveAnnotation(an.bookId, an.id)}
                            className={`px-2.5 py-1 rounded-lg ${textStyles.microBold} ${semantic.error} ${theme.focusRing} flex items-center gap-1`}
                          >
                            <Trash2 className="w-3 h-3" aria-hidden />
                            Удалить
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </article>
              </li>
            );
          })
        )}
      </ul>

      {editing ? (
        <div className={`shrink-0 px-3 py-3 border-t ${theme.header} space-y-2`}>
          <p className={`${textStyles.captionBold}`}>Редактировать заметку</p>
          <textarea
            value={editNote}
            onChange={(e) => setEditNote(e.target.value)}
            rows={3}
            className={`w-full rounded-xl border px-3 py-2 ${textStyles.body} ${theme.input}`}
          />
          <div className="flex gap-2">
            <button type="button" onClick={saveEdit} className={`flex-1 py-2 rounded-xl ${textStyles.captionBold} ${theme.accentBg}`}>
              Сохранить
            </button>
            <button type="button" onClick={() => setEditing(null)} className={`px-4 py-2 rounded-xl ${textStyles.captionBold} ${theme.card}`}>
              Отмена
            </button>
          </div>
        </div>
      ) : null}

      {focused && filtered.length > 1 && !editing ? (
        <div className={`shrink-0 px-3 py-2 border-t ${theme.header} flex gap-2`}>
          <button
            type="button"
            onClick={() => onOpenAnnotation(focused.bookId, focused.cfi, annotationToBook(focused, serverConfig))}
            className={`flex-1 py-2.5 rounded-xl ${textStyles.captionBold} ${theme.accentBg} ${theme.focusRing}`}
          >
            Открыть выбранную
          </button>
        </div>
      ) : null}
    </div>
  );
}
