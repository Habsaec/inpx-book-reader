import { registerPlugin } from '@capacitor/core';
import { isNativeApp } from './platform';

interface DownloadNotificationPlugin {
  start(options: { title?: string; text?: string; progress?: number; indeterminate?: boolean }): Promise<void>;
  update(options: { title?: string; text?: string; progress?: number; indeterminate?: boolean }): Promise<void>;
  stop(): Promise<void>;
}

const DownloadNotification = registerPlugin<DownloadNotificationPlugin>('DownloadNotification');

export async function notifyDownloadStart(title: string): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await DownloadNotification.start({
      title: 'Загрузка книг',
      text: title,
      progress: 0,
      indeterminate: true,
    });
  } catch {
    /* ignore */
  }
}

export async function notifyDownloadProgress(title: string, progress: number): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await DownloadNotification.update({
      title: 'Загрузка книг',
      text: title,
      progress: Math.round(progress),
      indeterminate: false,
    });
  } catch {
    /* ignore */
  }
}

export async function notifyDownloadStop(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await DownloadNotification.stop();
  } catch {
    /* ignore */
  }
}
