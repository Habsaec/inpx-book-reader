import { registerPlugin } from '@capacitor/core';
import { isNativeApp } from './platform';

interface DownloadNotificationPlugin {
  start(options: { title?: string; text?: string; progress?: number; indeterminate?: boolean }): Promise<void>;
  update(options: { title?: string; text?: string; progress?: number; indeterminate?: boolean }): Promise<void>;
  stop(): Promise<void>;
}

const DownloadNotification = registerPlugin<DownloadNotificationPlugin>('DownloadNotification');

/** Serialize start/update/stop so a late progress cannot resurrect FGS after stop. */
let notifyChain: Promise<void> = Promise.resolve();
let notifyGeneration = 0;
let notifyActive = false;

function enqueueNotify(task: (gen: number) => Promise<void>): Promise<void> {
  const gen = notifyGeneration;
  notifyChain = notifyChain.then(() => task(gen)).catch(() => {});
  return notifyChain;
}

export async function notifyDownloadStart(title: string): Promise<void> {
  if (!isNativeApp()) return;
  notifyActive = true;
  notifyGeneration += 1;
  await enqueueNotify(async (taskGen) => {
    if (taskGen !== notifyGeneration || !notifyActive) return;
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
  });
}

export async function notifyDownloadProgress(title: string, progress: number): Promise<void> {
  if (!isNativeApp() || !notifyActive) return;
  void enqueueNotify(async (taskGen) => {
    if (taskGen !== notifyGeneration || !notifyActive) return;
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
  });
}

export async function notifyDownloadStop(): Promise<void> {
  if (!isNativeApp()) return;
  notifyActive = false;
  notifyGeneration += 1;
  await enqueueNotify(async (taskGen) => {
    if (taskGen !== notifyGeneration) return;
    try {
      await DownloadNotification.stop();
    } catch {
      /* ignore */
    }
  });
}
