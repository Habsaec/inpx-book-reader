import { parseBookFile } from './bookParser';
import {
  fetchBookMeta,
  pickSeriesFromItem,
  mapServerBook,
  downloadBookBinary,
  bookContentUrl,
} from './inpxClient';
import { isNativeApp } from './platform';
import { Book, ServerConfig } from '../types';

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04] as const;
const SEVEN_ZIP_MAGIC = [0x37, 0x7a, 0xbc, 0xaf] as const;

function startsWithMagic(buffer: ArrayBuffer, magic: readonly number[]): boolean {
  if (buffer.byteLength < magic.length) return false;
  const h = new Uint8Array(buffer);
  return magic.every((b, i) => h[i] === b);
}

/** Не сохранять на диск EPUB в 7z (Flibusta) — читалка не откроет без перепаковки на сервере. */
export function assertDownloadedBookReadable(book: Book, buffer: ArrayBuffer): void {
  const ext = (book.ext || 'fb2').replace(/^\./, '').toLowerCase().replace(/\.zip$/, '');
  if (ext !== 'epub') return;
  if (startsWithMagic(buffer, SEVEN_ZIP_MAGIC)) {
    throw new Error(
      'EPUB пришёл в формате 7z. Обновите INPX Library Server и скачайте книгу заново.',
    );
  }
  if (!startsWithMagic(buffer, ZIP_MAGIC)) {
    throw new Error('Скачанный файл не похож на EPUB (ZIP). Попробуйте скачать заново.');
  }
}

export async function fetchBookBinary(
  config: ServerConfig,
  book: Book,
  onProgress?: (loaded: number, total: number) => void,
): Promise<ArrayBuffer> {
  if (isNativeApp()) {
    return downloadBookBinary(config, book.id, onProgress);
  }
  const downloadUrl = book.contentUrl || bookContentUrl(config, book.id);
  const headers: Record<string, string> = {};
  if (config.username && config.password) {
    headers.Authorization =
      'Basic ' + btoa(unescape(encodeURIComponent(`${config.username}:${config.password}`)));
  }
  const proxyUrl = `/api/proxy?url=${encodeURIComponent(downloadUrl)}`;
  const response = await fetch(proxyUrl, { headers });
  if (!response.ok) throw new Error(`Ошибка загрузки: HTTP ${response.status}`);
  return response.arrayBuffer();
}

export async function buildChaptersJson(book: Book, buffer: ArrayBuffer): Promise<string> {
  try {
    const parsed = await parseBookFile(`${book.title}.${book.ext || 'fb2'}`, buffer);
    return JSON.stringify(parsed.chapters);
  } catch {
    return '[]';
  }
}

/** Дополняет метаданные из API сервера перед сохранением на диск. */
export async function enrichBookForDownload(config: ServerConfig, book: Book): Promise<Book> {
  if (book.series?.trim()) {
    return book.seriesNo != null && book.seriesNo > 0
      ? book
      : await fetchAndMergeMeta(config, book);
  }
  return fetchAndMergeMeta(config, book);
}

async function fetchAndMergeMeta(config: ServerConfig, book: Book): Promise<Book> {
  try {
    const meta = await fetchBookMeta(config, book.id);
    if (!meta) return book;

    const fromList = pickSeriesFromItem(meta);
    const fromServer = mapServerBook(meta, config);

    return {
      ...book,
      title: book.title || fromServer.title,
      author: book.author || fromServer.author,
      ext: book.ext || fromServer.ext,
      series: book.series?.trim() || fromList.series,
      seriesNo: book.seriesNo ?? fromList.seriesNo,
      genre: book.genre || fromServer.genre,
      subgenre: book.subgenre || fromServer.subgenre,
      genresDisplay: book.genresDisplay ?? fromServer.genresDisplay,
    };
  } catch {
    return book;
  }
}
