/**
 * Formats the built-in reader (Foliate in the WebView) opens: EPUB, FB2/FBZ, MOBI/AZW3, CBZ, PDF, TXT.
 * Anything else the server lists (DJVU, CBR, RTF, DOCX — Calibre libraries, folder sources) is
 * downloaded as is and handed to another app with «Открыть в другом приложении».
 */
const APP_READER_FORMATS = new Set(['epub', 'fb2', 'fbz', 'mobi', 'azw3', 'azw', 'kf8', 'cbz', 'pdf', 'txt']);

/** `fb2.zip` → `fb2`, `.PDF` → `pdf`; empty = FB2 (the server default). */
export function normalizeBookExt(ext: string | null | undefined): string {
  const raw = String(ext || 'fb2').trim().toLowerCase().replace(/^\./, '');
  return raw.replace(/\.zip$/, '') || 'fb2';
}

export function isAppReaderFormat(ext: string | null | undefined): boolean {
  return APP_READER_FORMATS.has(normalizeBookExt(ext));
}

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  djvu: 'image/vnd.djvu',
  djv: 'image/vnd.djvu',
  cbz: 'application/vnd.comicbook+zip',
  cbr: 'application/vnd.comicbook-rar',
  txt: 'text/plain',
  rtf: 'application/rtf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  epub: 'application/epub+zip',
  fb2: 'application/x-fictionbook+xml',
  mobi: 'application/x-mobipocket-ebook',
  azw3: 'application/vnd.amazon.ebook',
};

/** MIME type for the «open with» intent (Android picks the apps by it). */
export function bookMimeType(ext: string | null | undefined): string {
  return MIME_BY_EXT[normalizeBookExt(ext)] || 'application/octet-stream';
}
