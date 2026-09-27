/**
 * Primary action for a book tile/row (Home and other storefront surfaces).
 * Secondary actions (favourite, read, delete, about) live in BookActionsSheet.
 */

export type BookPrimaryKind = 'download' | 'downloading' | 'read' | 'continue' | 'reread';

export type BookPrimaryAction = {
  kind: BookPrimaryKind;
  label: string;
  disabled: boolean;
};

const LABELS: Record<BookPrimaryKind, string> = {
  download: 'Скачать',
  downloading: 'Скачивается',
  read: 'Читать',
  continue: 'Продолжить',
  reread: 'Читать',
};

export function resolveBookPrimaryAction(input: {
  hasFile: boolean;
  isDownloading?: boolean;
  progress?: number;
  isRead?: boolean;
}): BookPrimaryAction {
  const progress = Math.max(0, Math.min(100, Math.round(Number(input.progress) || 0)));

  if (!input.hasFile) {
    if (input.isDownloading) {
      return { kind: 'downloading', label: LABELS.downloading, disabled: true };
    }
    return { kind: 'download', label: LABELS.download, disabled: false };
  }

  if (progress > 0 && progress < 99) {
    return { kind: 'continue', label: LABELS.continue, disabled: false };
  }

  if (isBookFinished(progress, input.isRead)) {
    return { kind: 'reread', label: LABELS.reread, disabled: false };
  }

  return { kind: 'read', label: LABELS.read, disabled: false };
}

/** Green read mark: explicit «прочитано», or progress already at the server threshold. */
export function isBookFinished(progress?: number, isRead?: boolean): boolean {
  if (isRead) return true;
  const pct = Math.max(0, Math.min(100, Math.round(Number(progress) || 0)));
  return pct >= 99;
}

export function isBookDownloadInFlight(
  bookId: string,
  downloadingId?: string | null,
  queuedBookIds?: Iterable<string> | null,
): boolean {
  if (downloadingId === bookId) return true;
  if (!queuedBookIds) return false;
  if (queuedBookIds instanceof Set) return queuedBookIds.has(bookId);
  for (const id of queuedBookIds) {
    if (id === bookId) return true;
  }
  return false;
}
