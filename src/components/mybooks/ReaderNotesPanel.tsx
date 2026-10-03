import React from 'react';
import { ClipboardCopy, Trash2 } from 'lucide-react';
import { theme } from '../../lib/appTheme';
import type { LocalReaderAnnotationItem } from '../../lib/offlineReaderStore';
import type { ServerConfig } from '../../types';
import {
  ANNOTATION_COLOR_LABELS,
  ANNOTATION_COLOR_SWATCH,
  ANNOTATION_COLORS,
  annotationToBook,
  copyTextToClipboard,
  filterAnnotationsByBook,
  filterAnnotationsByColor,
  formatAnnotationCopyText,
  type AnnotationColorFilter,
} from '../../lib/readerNotesUtils';
import { useBarHeight } from '../../ui/useBarHeight';
import { textStyles, touchMin, semantic, radii, motion, elevation } from '../../ui/tokens';
import { useSnackbar } from '../../ui/Snackbar';

interface ReaderNotesPanelProps {
  annotations: LocalReaderAnnotationItem[];
  serverConfig: ServerConfig;
  downloadedBookIds?: string[];
  onOpenAnnotation: (bookId: string, cfi: string, book: ReturnType<typeof annotationToBook>) => void;
  onRemoveAnnotation?: (bookId: string, annId: number) => void | Promise<void>;
  onUpdateAnnotation?: (bookId: string, annId: number, patch: { note?: string; color?: string }) => void | Promise<void>;
  onGoBack?: () => void;
}

export default function ReaderNotesPanel({
  annotations,
  serverConfig,
  downloadedBookIds,
  onOpenAnnotation,
  onRemoveAnnotation,
  onUpdateAnnotation,
}: ReaderNotesPanelProps) {
  const snackbar = useSnackbar();
  const [colorFilter, setColorFilter] = React.useState<AnnotationColorFilter>('all');
  const [bookFilter, setBookFilter] = React.useState<string | 'all'>('all');
  const [editing, setEditing] = React.useState<LocalReaderAnnotationItem | null>(null);
  const [editNote, setEditNote] = React.useState('');
  const [editColor, setEditColor] = React.useState('yellow');
  const [setToolEl, toolH] = useBarHeight();

  const bookOptions = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const an of annotations) map.set(an.bookId, an.bookTitle);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'ru'));
  }, [annotations]);

  const filtered = React.useMemo(() => {
    const byBook = filterAnnotationsByBook(annotations, bookFilter);
    return filterAnnotationsByColor(byBook, colorFilter);
  }, [annotations, bookFilter, colorFilter]);

  const handleCopy = async (an: LocalReaderAnnotationItem) => {
    const ok = await copyTextToClipboard(formatAnnotationCopyText(an));
    if (!ok) snackbar.show('Не удалось скопировать', undefined, 'error');
  };

  const startEdit = (an: LocalReaderAnnotationItem) => {
    setEditing(an);
    setEditNote(an.note || '');
    setEditColor(an.color || 'yellow');
  };

  const saveEdit = () => {
    if (!editing || !onUpdateAnnotation) return;
    void onUpdateAnnotation(editing.bookId, editing.id, { note: editNote.trim(), color: editColor });
    setEditing(null);
  };

  if (!annotations.length) {
    return (
      <div className="flex-1 overflow-y-auto inpx-page-scroll px-5">
        <p className={`${textStyles.body} ${theme.textMuted}`}>Нет заметок. Выделяйте фрагменты в читалке — они появятся здесь.</p>
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-h-0 flex flex-col" style={{ ['--inpx-tool' as string]: `${toolH}px` }}>
      <div
        ref={setToolEl}
        className="inpx-chrome inpx-chrome-top absolute inset-x-0 z-10 px-5 py-1 space-y-2"
        style={{ top: 'calc(var(--app-header-offset, 4rem) + var(--inpx-under, 0px))' }}
      >
        {bookOptions.length > 1 && (
          <label className={`block ${textStyles.caption} ${theme.textMuted}`}>
            Книга
            <select
              value={bookFilter}
              onChange={(e) => setBookFilter(e.target.value as string | 'all')}
              className={`mt-2 w-full ${radii.lg} border px-4 py-2.5 ${textStyles.caption} ${theme.input}`}
            >
              <option value="all">Все книги</option>
              {bookOptions.map(([id, title]) => (
                <option key={id} value={id}>{title}</option>
              ))}
            </select>
          </label>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setColorFilter('all')}
            className={`min-h-12 px-4 ${radii.button} ${textStyles.caption} ${theme.focusRing} ${motion.press} ${
              colorFilter === 'all' ? `${theme.accentActive} font-semibold` : `${theme.chip} ${theme.chipHover} font-medium`
            }`}
          >
            Все
          </button>
          {ANNOTATION_COLORS.map((c) => {
            const count = annotations.filter((a) => a.color === c).length;
            if (!count) return null;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setColorFilter(c)}
                title={ANNOTATION_COLOR_LABELS[c]}
                aria-label={`${ANNOTATION_COLOR_LABELS[c]} (${count})`}
                className={`min-h-9 min-w-9 inline-flex items-center justify-center rounded-full ${theme.focusRing} ${
                  colorFilter === c ? 'ring-2 ring-[var(--app-accent)]/50' : ''
                }`}
              >
                <span className={`w-2.5 h-2.5 rounded-full ${ANNOTATION_COLOR_SWATCH[c]}`} aria-hidden />
              </button>
            );
          })}
        </div>
      </div>

      <ul className="flex-1 min-h-0 overflow-y-auto inpx-page-scroll px-5 py-3 space-y-3">
        {filtered.length === 0 ? (
          <li className={`${textStyles.caption} ${theme.textMuted} text-center py-8`}>
            Нет заметок с выбранным цветом
          </li>
        ) : (
          filtered.map((an) => {
            const key = `${an.bookId}-${an.id}`;
            const swatch = ANNOTATION_COLOR_SWATCH[an.color as keyof typeof ANNOTATION_COLOR_SWATCH];
            const isEditing = editing?.bookId === an.bookId && editing.id === an.id;
            return (
              <li key={key} className={`${radii.lg} ${theme.card} ${elevation.card} p-4`}>
                <div className="flex gap-3">
                  <span className={`w-1 shrink-0 rounded-full ${swatch ?? 'bg-yellow-400'}`} aria-hidden />
                  <div className="flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => onOpenAnnotation(an.bookId, an.cfi, annotationToBook(an, serverConfig))}
                      className={`w-full text-left ${theme.focusRing} ${radii.md}`}
                    >
                      <p className={`${textStyles.caption} ${theme.textMuted} truncate`}>{an.bookTitle}</p>
                      {an.text ? (
                        <p className={`${textStyles.body} mt-1 line-clamp-4`}>«{an.text}»</p>
                      ) : null}
                      {downloadedBookIds && !downloadedBookIds.includes(an.bookId) ? (
                        <p className={`${textStyles.caption} ${theme.textMuted} mt-1`}>Не скачана</p>
                      ) : null}
                    </button>
                    {isEditing ? (
                      <div className="mt-3 space-y-3">
                        <textarea
                          value={editNote}
                          onChange={(e) => setEditNote(e.target.value)}
                          rows={3}
                          aria-label="Комментарий к выделению"
                          placeholder="Комментарий к этому фрагменту"
                          className={`w-full ${radii.lg} border px-3 py-2 ${textStyles.body} ${theme.input}`}
                        />
                        <div className="flex flex-wrap gap-2" role="group" aria-label="Цвет выделения">
                          {ANNOTATION_COLORS.map((c) => (
                            <button
                              key={c}
                              type="button"
                              aria-label={ANNOTATION_COLOR_LABELS[c]}
                              aria-pressed={editColor === c}
                              onClick={() => setEditColor(c)}
                              className={`min-h-11 min-w-11 inline-flex items-center justify-center rounded-full ${theme.focusRing} ${motion.press} ${
                                editColor === c ? 'ring-2 ring-[var(--app-accent)]' : ''
                              }`}
                            >
                              <span className={`w-3 h-3 rounded-full ${ANNOTATION_COLOR_SWATCH[c]}`} aria-hidden />
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={saveEdit}
                            className={`min-h-11 px-4 ${radii.button} ${textStyles.captionBold} ${theme.accentBg} ${motion.press}`}
                          >
                            Сохранить
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditing(null)}
                            className={`min-h-11 px-4 ${radii.button} ${textStyles.caption} ${theme.chip} ${theme.focusRing} ${motion.press}`}
                          >
                            Отмена
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEdit(an)}
                        className={`mt-2 w-full text-left ${theme.focusRing} ${radii.md}`}
                      >
                        {an.note ? (
                          <p className={`${textStyles.body} line-clamp-3`}>{an.note}</p>
                        ) : (
                          <p className={`${textStyles.caption} ${theme.textMuted}`}>Добавить комментарий</p>
                        )}
                      </button>
                    )}
                    {!isEditing ? (
                      <div className="mt-2 flex gap-1">
                        <button
                          type="button"
                          aria-label="Копировать"
                          onClick={() => void handleCopy(an)}
                          className={`${touchMin} inline-flex items-center justify-center ${radii.button} ${theme.textMuted} ${theme.focusRing} ${motion.press}`}
                        >
                          <ClipboardCopy className="w-4 h-4" aria-hidden />
                        </button>
                        {onRemoveAnnotation ? (
                          <button
                            type="button"
                            aria-label="Удалить заметку"
                            onClick={() => void onRemoveAnnotation(an.bookId, an.id)}
                            className={`${touchMin} inline-flex items-center justify-center ${radii.button} ${semantic.error} ${theme.focusRing} ${motion.press}`}
                          >
                            <Trash2 className="w-4 h-4" aria-hidden />
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
