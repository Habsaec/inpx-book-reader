import React from 'react';
import { ClipboardCopy, MoreHorizontal, Pencil, StickyNote, Trash2 } from 'lucide-react';
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
  const [menuKey, setMenuKey] = React.useState<string | null>(null);
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

  const handleCopy = async (an: LocalReaderAnnotationItem) => {
    const ok = await copyTextToClipboard(formatAnnotationCopyText(an));
    if (!ok) snackbar.show('Не удалось скопировать', undefined, 'error');
    setMenuKey(null);
  };

  const handleExport = async () => {
    if (!filtered.length) return;
    const ok = await copyTextToClipboard(exportAnnotationsMarkdown(filtered));
    if (!ok) snackbar.show('Не удалось экспортировать', undefined, 'error');
  };

  const handleExportJson = async () => {
    if (!filtered.length) return;
    const ok = await copyTextToClipboard(exportAnnotationsJson(filtered));
    if (!ok) snackbar.show('Не удалось экспортировать', undefined, 'error');
  };

  const startEdit = (an: LocalReaderAnnotationItem) => {
    setEditing(an);
    setEditNote(an.note || '');
    setMenuKey(null);
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
        description="Откройте книгу, выделите текст и добавьте заметку — она появится здесь."
      />
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className={`shrink-0 px-4 py-3 border-b space-y-3 ${theme.header}`}>
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

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setColorFilter('all')}
            className={`min-h-9 px-2.5 rounded-full ${textStyles.caption} ${theme.focusRing} ${
              colorFilter === 'all' ? `${theme.accentText} font-semibold` : theme.textMuted
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
                  colorFilter === c ? 'ring-2 ring-[var(--app-link)]/50' : ''
                }`}
              >
                <span className={`w-2.5 h-2.5 rounded-full ${ANNOTATION_COLOR_SWATCH[c]}`} aria-hidden />
              </button>
            );
          })}
          {filtered.length > 0 && (
            <div className={`ml-auto flex items-center gap-3 ${textStyles.caption}`}>
              <button type="button" onClick={() => void handleExport()} className={`${theme.accentText} ${theme.focusRing}`}>
                MD
              </button>
              <button type="button" onClick={() => void handleExportJson()} className={`${theme.accentText} ${theme.focusRing}`}>
                JSON
              </button>
            </div>
          )}
        </div>
      </div>

      <ul className="flex-1 min-h-0 overflow-y-auto px-4">
        {filtered.length === 0 ? (
          <li className={`${textStyles.caption} ${theme.textMuted} text-center py-8`}>
            Нет заметок с выбранным цветом
          </li>
        ) : (
          filtered.map((an) => {
            const key = `${an.bookId}-${an.id}`;
            const swatch = ANNOTATION_COLOR_SWATCH[an.color as keyof typeof ANNOTATION_COLOR_SWATCH];
            const menuOpen = menuKey === key;
            return (
              <li key={key} className={`border-b last:border-b-0 py-3 ${theme.divider}`}>
                <div className="flex gap-2">
                  <span className={`w-1 shrink-0 rounded-full ${swatch ?? 'bg-yellow-400'}`} aria-hidden />
                  <button
                    type="button"
                    onClick={() => onOpenAnnotation(an.bookId, an.cfi, annotationToBook(an, serverConfig))}
                    className={`flex-1 min-w-0 text-left ${theme.focusRing} rounded-lg`}
                  >
                    <p className={`${textStyles.bookTitle} text-sm truncate`}>{an.bookTitle}</p>
                    {an.text ? (
                      <p className={`${textStyles.body} mt-1 line-clamp-3`}>«{an.text}»</p>
                    ) : null}
                    {an.note ? (
                      <p className={`${textStyles.caption} ${theme.textMuted} mt-1 line-clamp-2`}>{an.note}</p>
                    ) : null}
                  </button>
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      aria-label="Действия"
                      aria-expanded={menuOpen}
                      onClick={() => setMenuKey(menuOpen ? null : key)}
                      className={`${touchMin} inline-flex items-center justify-center rounded-lg ${theme.textMuted} ${theme.focusRing}`}
                    >
                      <MoreHorizontal className="w-5 h-5" />
                    </button>
                    {menuOpen ? (
                      <div
                        className={`absolute right-0 top-full z-20 mt-1 min-w-[10rem] rounded-xl border py-1 shadow-sm ${theme.dropdown}`}
                        role="menu"
                      >
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => void handleCopy(an)}
                          className={`w-full px-3 py-2.5 text-left ${textStyles.caption} flex items-center gap-2 ${theme.rowPress}`}
                        >
                          <ClipboardCopy className="w-3.5 h-3.5" aria-hidden />
                          Копировать
                        </button>
                        {onUpdateAnnotation ? (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => startEdit(an)}
                            className={`w-full px-3 py-2.5 text-left ${textStyles.caption} flex items-center gap-2 ${theme.rowPress}`}
                          >
                            <Pencil className="w-3.5 h-3.5" aria-hidden />
                            Изменить
                          </button>
                        ) : null}
                        {onRemoveAnnotation ? (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setMenuKey(null);
                              void onRemoveAnnotation(an.bookId, an.id);
                            }}
                            className={`w-full px-3 py-2.5 text-left ${textStyles.caption} flex items-center gap-2 ${semantic.error} ${theme.rowPress}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden />
                            Удалить
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

      {editing ? (
        <div className={`shrink-0 px-4 py-3 border-t space-y-2 ${theme.header}`}>
          <p className={textStyles.sectionLabel}>Редактировать заметку</p>
          <textarea
            value={editNote}
            onChange={(e) => setEditNote(e.target.value)}
            rows={3}
            className={`w-full rounded-xl border px-3 py-2 ${textStyles.body} ${theme.input}`}
          />
          <div className="flex gap-2">
            <button type="button" onClick={saveEdit} className={`flex-1 py-2.5 rounded-xl ${textStyles.captionBold} ${theme.accentBg}`}>
              Сохранить
            </button>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className={`px-4 py-2.5 rounded-xl ${textStyles.caption} ${theme.textMuted} ${theme.focusRing}`}
            >
              Отмена
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
