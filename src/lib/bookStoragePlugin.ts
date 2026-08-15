import { registerPlugin } from '@capacitor/core';

/** Single Capacitor registration for native BookStorage — avoid duplicate plugin warnings. */
export interface BookStoragePlugin {
  getDefaultStorageDirectory(): Promise<{ uri: string; label: string }>;
  checkAccess(options: { treeUri: string }): Promise<{ ok: boolean; code?: string }>;
  fileExists(options: { treeUri: string; path: string }): Promise<{ exists: boolean }>;
  writeBinaryFile(options: { treeUri: string; path: string; data: string }): Promise<void>;
  readBinaryFile(options: { treeUri: string; path: string }): Promise<{ data: string }>;
  writeTextFile(options: { treeUri: string; path: string; content: string }): Promise<void>;
  readTextFile(options: { treeUri: string; path: string }): Promise<{ content: string }>;
  deleteFile(options: { treeUri: string; path: string }): Promise<void>;
  importContentUri(options: { treeUri: string; contentUri: string }): Promise<{ relativePath: string }>;
  getAvailableBytes(): Promise<{ bytes: number }>;
  appCacheFileExists(options: { path: string }): Promise<{ exists: boolean }>;
  writeAppCacheFile(options: { path: string; data: string }): Promise<void>;
  readAppCacheFile(options: { path: string }): Promise<{ data: string }>;
  deleteAppCacheFile(options: { path: string }): Promise<void>;
  /** Absolute path for Capacitor.convertFileSrc — avoids base64 bridge for image display. */
  getAppCacheFilePath(options: { path: string }): Promise<{ absolutePath: string }>;
  /** Stream HTTP response directly into app-private image cache. */
  downloadUrlToAppCache(options: {
    url: string;
    path: string;
    headers?: Record<string, string>;
  }): Promise<{ bytesWritten: number; digestSha256: string; statusCode: number }>;
  /** Stream HTTP response directly into SAF/Downloads storage (async with progress events). */
  downloadUrlToStorage(options: {
    url: string;
    treeUri: string;
    path: string;
    jobId?: string;
    headers?: Record<string, string>;
  }): Promise<{ bytesWritten: number; digestSha256: string; statusCode: number }>;
  cancelStorageDownload(options: { jobId: string }): Promise<void>;
  getStorageFileInfo(options: {
    treeUri: string;
    path: string;
  }): Promise<{ size: number; digestSha256: string }>;
  /** Absolute path for downloads-backed trees (null for pure SAF) — big books go via file URL, not base64. */
  getStorageFilePath(options: {
    treeUri: string;
    path: string;
  }): Promise<{ absolutePath: string | null }>;
  /** Stream a SAF/Downloads book into app-private cache; returns a disk path for convertFileSrc. */
  copyStorageFileToBookCache(options: {
    treeUri: string;
    path: string;
  }): Promise<{ absolutePath: string }>;
  /** Recover a persisted SAF grant for Download/<folder> after JS forgot the content:// URI. */
  getPersistedDownloadsTree(options?: { folder?: string }): Promise<{ uri: string | null }>;
  readStorageFileHeader(options: {
    treeUri: string;
    path: string;
    maxBytes?: number;
  }): Promise<{ data: string }>;
  addListener(
    eventName: 'storageDownloadProgress',
    listenerFunc: (event: { jobId: string; loaded: number; total: number }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

export const BookStorage = registerPlugin<BookStoragePlugin>('BookStorage');
