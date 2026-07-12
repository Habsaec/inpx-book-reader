import { Book, ServerConfig } from '../types';
import type { LocalReaderAnnotationItem } from './offlineReaderStore';
import { bookContentUrl, displayCoverUrl } from './inpxClient';

export const ANNOTATION_COLORS = ['yellow', 'green', 'blue', 'pink'] as const;
export type AnnotationColorFilter = 'all' | (typeof ANNOTATION_COLORS)[number];

export const ANNOTATION_COLOR_LABELS: Record<(typeof ANNOTATION_COLORS)[number], string> = {
  yellow: 'Жёлтый',
  green: 'Зелёный',
  blue: 'Синий',
  pink: 'Розовый',
};

export const ANNOTATION_COLOR_SWATCH: Record<(typeof ANNOTATION_COLORS)[number], string> = {
  yellow: 'bg-yellow-400',
  green: 'bg-emerald-400',
  blue: 'bg-blue-400',
  pink: 'bg-pink-400',
};

export function annotationToBook(an: LocalReaderAnnotationItem, config: ServerConfig): Book {
  const ext = (an.ext || 'fb2').replace(/^\./, '');
  return {
    id: an.bookId,
    title: an.bookTitle,
    author: '',
    ext,
    contentUrl: bookContentUrl(config, an.bookId),
    coverUrl: displayCoverUrl(config, an.bookId),
  };
}

export function filterAnnotationsByColor(
  items: LocalReaderAnnotationItem[],
  color: AnnotationColorFilter,
): LocalReaderAnnotationItem[] {
  if (color === 'all') return items;
  return items.filter((an) => an.color === color);
}

export function formatAnnotationCopyText(an: LocalReaderAnnotationItem): string {
  const quote = an.text?.trim();
  const note = an.note?.trim();
  const parts: string[] = [];
  if (quote) parts.push(`«${quote}»`);
  if (note) parts.push(note);
  parts.push(`— ${an.bookTitle}`);
  return parts.join('\n');
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fallback below */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function exportAnnotationsJson(items: LocalReaderAnnotationItem[]): string {
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      count: items.length,
      annotations: items,
    },
    null,
    2,
  );
}

export function exportAnnotationsMarkdown(items: LocalReaderAnnotationItem[]): string {
  const lines = ['# Заметки и выделения', ''];
  for (const an of items) {
    lines.push(`## ${an.bookTitle}`);
    if (an.text) lines.push(`> ${an.text}`);
    if (an.note) lines.push('', an.note);
    lines.push('');
  }
  return lines.join('\n').trim();
}

export function filterAnnotationsByBook(
  items: LocalReaderAnnotationItem[],
  bookId: string | 'all',
): LocalReaderAnnotationItem[] {
  if (bookId === 'all') return items;
  return items.filter((an) => an.bookId === bookId);
}
