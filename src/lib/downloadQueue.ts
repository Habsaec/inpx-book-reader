import type { Book, ServerConfig } from '../types';
import { assertDownloadedBookReadable, buildChaptersJson, enrichBookForDownload, fetchBookBinary } from './bookDownload';
import { persistBookToDirectory } from './bookStorage';
import { cacheCoverFromServer } from './coverCache';
import type { StorageDirectory } from './storageDirectory';
import { get, set } from 'idb-keyval';
import { notifyDownloadProgress, notifyDownloadStart, notifyDownloadStop } from './downloadNotification';
import { assertEnoughStorage } from './storageSpace';

export type DownloadStatus = 'queued' | 'downloading' | 'saving' | 'saved' | 'error' | 'cancelled';

export interface DownloadJob {
  id: string;
  book: Book;
  status: DownloadStatus;
  progress: number;
  bytesLoaded: number;
  bytesTotal: number;
  speedBps: number;
  error: string | null;
  addedAt: number;
  startedAt: number | null;
  finishedAt: number | null;
}

const QUEUE_STORAGE_KEY = 'inpx_download_queue_v1';

/** Max simultaneous book downloads (network + disk). */
export const MAX_CONCURRENT_DOWNLOADS = 2;

type Listener = () => void;

class DownloadQueueManager {
  private jobs: DownloadJob[] = [];
  private listeners = new Set<Listener>();
  private activeCount = 0;
  private cancelledIds = new Set<string>();
  private serverConfig: ServerConfig | null = null;
  private storageDirectory: StorageDirectory | null = null;
  private onComplete: ((book: Book, content: string, buffer: ArrayBuffer) => Promise<void>) | null = null;
  private canDownload = false;

  async hydrate(): Promise<void> {
    try {
      const saved = (await get(QUEUE_STORAGE_KEY)) as DownloadJob[] | undefined;
      if (saved?.length) {
        this.jobs = saved.map((j) =>
          j.status === 'downloading' || j.status === 'saving'
            ? { ...j, status: 'queued' as const, progress: 0 }
            : j,
        );
      }
    } catch {
      /* ignore */
    }
  }

  private persist(): void {
    void set(QUEUE_STORAGE_KEY, this.jobs);
    this.notify();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    this.listeners.forEach((fn) => fn());
  }

  configure(opts: {
    serverConfig: ServerConfig;
    storageDirectory: StorageDirectory | null;
    canDownload: boolean;
    onComplete: (book: Book, content: string, buffer: ArrayBuffer) => Promise<void>;
  }): void {
    this.serverConfig = opts.serverConfig;
    this.storageDirectory = opts.storageDirectory;
    this.canDownload = opts.canDownload;
    this.onComplete = opts.onComplete;
    if (opts.canDownload && opts.storageDirectory?.uri) {
      this.pumpQueue();
    }
  }

  getJobs(): DownloadJob[] {
    return [...this.jobs];
  }

  getJob(bookId: string): DownloadJob | undefined {
    return this.jobs.find((j) => j.id === bookId);
  }

  isActive(bookId: string): boolean {
    const j = this.getJob(bookId);
    return j?.status === 'downloading' || j?.status === 'saving' || j?.status === 'queued';
  }

  enqueue(book: Book): void {
    if (this.jobs.some((j) => j.id === book.id && (j.status === 'queued' || j.status === 'downloading' || j.status === 'saving'))) {
      return;
    }
    if (this.jobs.some((j) => j.id === book.id && j.status === 'saved')) {
      return;
    }
    const existing = this.jobs.find((j) => j.id === book.id);
    if (existing) {
      existing.status = 'queued';
      existing.error = null;
      existing.progress = 0;
    } else {
      this.jobs.push({
        id: book.id,
        book,
        status: 'queued',
        progress: 0,
        bytesLoaded: 0,
        bytesTotal: 0,
        speedBps: 0,
        error: null,
        addedAt: Date.now(),
        startedAt: null,
        finishedAt: null,
      });
    }
    this.persist();
    this.pumpQueue();
  }

  cancel(bookId: string): void {
    this.cancelledIds.add(bookId);
    const job = this.jobs.find((j) => j.id === bookId);
    if (job && (job.status === 'queued' || job.status === 'downloading')) {
      job.status = 'cancelled';
      job.finishedAt = Date.now();
      this.persist();
    }
  }

  retry(bookId: string): void {
    const job = this.jobs.find((j) => j.id === bookId);
    if (!job) return;
    job.status = 'queued';
    job.error = null;
    job.progress = 0;
    this.cancelledIds.delete(bookId);
    this.persist();
    this.pumpQueue();
  }

  remove(bookId: string): void {
    this.jobs = this.jobs.filter((j) => j.id !== bookId);
    this.persist();
  }

  clearFinished(): void {
    this.jobs = this.jobs.filter((j) => j.status === 'queued' || j.status === 'downloading' || j.status === 'saving');
    this.persist();
  }

  private pumpQueue(): void {
    if (!this.canDownload || !this.storageDirectory?.uri || !this.serverConfig || !this.onComplete) {
      return;
    }
    while (this.activeCount < MAX_CONCURRENT_DOWNLOADS) {
      const next = this.jobs.find((j) => j.status === 'queued');
      if (!next) break;
      this.activeCount++;
      void this.runJob(next);
    }
  }

  private async runJob(next: DownloadJob): Promise<void> {
    const wasIdle = this.activeCount === 1;
    next.status = 'downloading';
    next.startedAt = Date.now();
    next.error = null;
    this.persist();
    if (wasIdle) void notifyDownloadStart(next.book.title);

    try {
      if (this.cancelledIds.has(next.id)) throw new Error('Отменено');

      await assertEnoughStorage(this.estimateRequiredBytes());

      const buffer = await this.fetchWithProgress(next);
      if (this.cancelledIds.has(next.id)) throw new Error('Отменено');

      const enriched = await enrichBookForDownload(this.serverConfig!, next.book);
      assertDownloadedBookReadable(enriched, buffer);

      next.status = 'saving';
      next.progress = 95;
      this.persist();

      const chaptersJson = await buildChaptersJson(enriched, buffer);
      await this.onComplete!(enriched, chaptersJson, buffer);

      if (this.canDownload && this.storageDirectory?.uri) {
        void cacheCoverFromServer(this.storageDirectory, this.serverConfig!, enriched.id);
      }

      next.status = 'saved';
      next.progress = 100;
      next.finishedAt = Date.now();
    } catch (err) {
      if (this.cancelledIds.has(next.id)) {
        next.status = 'cancelled';
      } else {
        next.status = 'error';
        next.error = err instanceof Error ? err.message : 'Ошибка загрузки';
      }
      next.finishedAt = Date.now();
    } finally {
      this.cancelledIds.delete(next.id);
      this.activeCount = Math.max(0, this.activeCount - 1);
      this.persist();
      const hasPending = this.jobs.some((j) => j.status === 'queued' || j.status === 'downloading' || j.status === 'saving');
      if (!hasPending) void notifyDownloadStop();
      this.pumpQueue();
    }
  }

  private estimateRequiredBytes(): number {
    return this.jobs
      .filter((j) => j.status === 'queued' || j.status === 'downloading' || j.status === 'saving')
      .reduce((sum, j) => sum + (j.book.size ?? 512 * 1024), 0);
  }

  private async fetchWithProgress(job: DownloadJob): Promise<ArrayBuffer> {
    const start = Date.now();
    job.bytesLoaded = 0;
    job.bytesTotal = job.book.size ?? 0;
    job.progress = 5;
    this.persist();
    void notifyDownloadProgress(job.book.title, job.progress);

    const buffer = await fetchBookBinary(this.serverConfig!, job.book, (loaded, total) => {
      job.bytesLoaded = loaded;
      job.bytesTotal = total || job.book.size || loaded;
      job.progress = total > 0 ? Math.min(88, Math.round((loaded / total) * 88)) : Math.min(40, job.progress + 2);
      const elapsed = (Date.now() - (job.startedAt ?? Date.now())) / 1000;
      job.speedBps = elapsed > 0 ? loaded / elapsed : 0;
      this.persist();
      void notifyDownloadProgress(job.book.title, job.progress);
    });
    job.bytesLoaded = buffer.byteLength;
    job.bytesTotal = buffer.byteLength;
    const elapsed = (Date.now() - start) / 1000;
    job.speedBps = elapsed > 0 ? buffer.byteLength / elapsed : 0;
    job.progress = 90;
    this.persist();
    void notifyDownloadProgress(job.book.title, job.progress);
    return buffer;
  }
}

export const downloadQueue = new DownloadQueueManager();

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatSpeed(bps: number): string {
  return `${formatBytes(bps)}/s`;
}

export function statusLabel(status: DownloadStatus): string {
  switch (status) {
    case 'queued': return 'В очереди';
    case 'downloading': return 'Скачивается';
    case 'saving': return 'Сохранение…';
    case 'saved': return 'Сохранено';
    case 'error': return 'Ошибка';
    case 'cancelled': return 'Отменено';
    default: return status;
  }
}
