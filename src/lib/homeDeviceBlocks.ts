/**
 * Блоки главной с содержимым устройства — «Скачанные» и «Папки».
 * Только приложение и только это устройство: не часть `homeLayout` аккаунта (сервер о них не знает),
 * данные берутся из локальной библиотеки, поэтому работают и актуальны без сети.
 * Показываются сразу после «Продолжить чтение»; по умолчанию выключены.
 */

import React from 'react';
import type { Book } from '../types';
import { getAppSettingJson, setAppSettingJson } from './appSettings';
import { isFolderLocalBookId } from './importExternalBook';

export const HOME_DEVICE_BLOCKS_KEY = 'home_device_blocks';
const EVENT = 'inpx-home-device-blocks';

export interface HomeDeviceBlocks {
  downloaded: boolean;
  folders: boolean;
}

export function normalizeHomeDeviceBlocks(raw: unknown): HomeDeviceBlocks {
  const obj = raw && typeof raw === 'object' ? (raw as Partial<Record<keyof HomeDeviceBlocks, unknown>>) : {};
  return {
    downloaded: obj.downloaded === true,
    folders: obj.folders === true,
  };
}

export function getHomeDeviceBlocks(): HomeDeviceBlocks {
  return normalizeHomeDeviceBlocks(getAppSettingJson<unknown>(HOME_DEVICE_BLOCKS_KEY, null));
}

export function setHomeDeviceBlocks(next: HomeDeviceBlocks): void {
  setAppSettingJson(HOME_DEVICE_BLOCKS_KEY, normalizeHomeDeviceBlocks(next));
  window.dispatchEvent(new Event(EVENT));
}

export function useHomeDeviceBlocks(): HomeDeviceBlocks {
  const [value, setValue] = React.useState(getHomeDeviceBlocks);
  React.useEffect(() => {
    const onChange = () => setValue(getHomeDeviceBlocks());
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);
  return value;
}

/**
 * «Скачанные» на главной: скачанные с сервера книги с файлом (без книг из папок), сначала по
 * последнему открытию (`recentIds`), затем остальные в исходном порядке.
 */
export function homeDownloadedBooks(books: Book[], recentIds: string[], limit = 12): Book[] {
  const withFile = books.filter((b) => Boolean(b.localFileName?.trim()) && !isFolderLocalBookId(b.id));
  const byId = new Map(withFile.map((b) => [b.id, b]));
  const out: Book[] = [];
  const seen = new Set<string>();
  const push = (book: Book | undefined) => {
    if (!book || seen.has(book.id) || out.length >= limit) return;
    seen.add(book.id);
    out.push(book);
  };
  for (const id of recentIds) push(byId.get(id));
  for (const book of withFile) push(book);
  return out;
}
