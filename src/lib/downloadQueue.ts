import type { Book, ServerConfig } from '../types';
import { assertDownloadedBookReadable, buildChaptersJson, enrichBookForDownload, fetchBookBinary } from './bookDownload';
import { isAuthError } from './inpxClient';
import type { StorageDirectory } from './storageDirectory';
import {
  checkStorageAccess,
  isStoragePermissionError,
  STORAGE_PERMISSION_REVOKED_MSG,
} from './storageDirectory';
import { get, set } from 'idb-keyval';
import { notifyDownloadProgress, notifyDownloadStart, notifyDownloadStop } from './downloadNotification';
import { assertEnoughStorage } from './storageSpace';
import { isNativeApp } from './platform';
import {
  assertDownloadedBookReadableNative,
  downloadBookToStorageNative,
  type NativeBookDownloadResult,
} from './nativeDownload';
import { bookStorageRelativePath, removeBookFromDirectory } from './bookStorage';

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

/** Shown when downloads pause because server/auth became unavailable. */
export const DOWNLOAD_OFFLINE_MSG = 'Нет подключения к серверу';

/** Abort when no bytes arrive for this long (stalled connection). */
const DOWNLOAD_STALL_MS = 90_000;

type Listener = () => void;

/** Keep finished jobs visible in the queue UI briefly (history). */
const FINISHED_HISTORY_MS = 60_000;

class DownloadQueueManager {
  private jobs: DownloadJob[] = [];
  private listeners = new Set<Listener>();
  private activeCount = 0;
  private cancelledIds = new Set<string>();
  private abortControllers = new Map<string, AbortController>();
  /** Re-download requested while an abort is still unwinding. */
  private pendingEnqueue = new Map<string, Book>();
  private serverConfig: ServerConfig | null = null;
  private storageDirectory: StorageDirectory | null = null;
  private onComplete:
    | ((
        book: Book,
        content: string,
        buffer: ArrayBuffer | undefined,
        native?: NativeBookDownloadResult,
      ) => Promise<Book | void>)
    | null = null;
  private onSaved: ((book: Book) => void) | null = null;
  private onError: ((book: Book, error: string) => void) | null = null;
  private canDownload = false;
  /** Hydrate once — remounting Home/widget must not reset in-flight jobs to queued. */
  private hydrated = false;
  private hydratePromise: Promise<void> | null = null;
  private finishedCleanupTimers = new Map<string, number>();
  private lastProgressNotifyAt = 0;
  private lastPersistAt = 0;
  /** True между pauseDownloadsForOffline и resume — abort'ы из-за потери сети. */
  private offlinePaused = false;

  async hydrate(): Promise<void> {
    if (this.hydrated) return;
    if (this.hydratePromise) return this.hydratePromise;
    this.hydratePromise = this.doHydrate().finally(() => {
      this.hydrated = true;
      this.hydratePromise = null;
    });
    return this.hydratePromise;
  }

  private async doHydrate(): Promise<void> {
    // Live downloads already own memory state — never clobber them from IDB.
    if (this.abortControllers.size > 0 || this.activeCount > 0) {
      this.notify();
      this.pumpQueue();
      return;
    }
    try {
      const saved = (await get(QUEUE_STORAGE_KEY)) as DownloadJob[] | undefined;
      if (saved?.length) {
        // Race: a download may have started while IDB was loading.
        if (this.abortControllers.size > 0 || this.activeCount > 0) {
          this.notify();
          this.pumpQueue();
          return;
        }
        const incoming = saved
          .map((j) =>
            j.status === 'downloading' || j.status === 'saving'
              ? { ...j, status: 'queued' as const, progress: 0, startedAt: null }
              : j,
          )
          .filter((j) => {
            if (j.status === 'cancelled') return false;
            if (
              (j.status === 'saved' || j.status === 'error')
              && j.finishedAt
              && Date.now() - j.finishedAt > FINISHED_HISTORY_MS
            ) {
              return false;
            }
            return true;
          });
        // Merge, не overwrite: enqueue мог успеть добавить задачу, пока читался IDB.
        const existingIds = new Set(this.jobs.map((j) => j.id));
        this.jobs = [...this.jobs, ...incoming.filter((j) => !existingIds.has(j.id))];
        for (const j of this.jobs) {
          if (j.status === 'saved' || j.status === 'error') {
            this.scheduleFinishedRemoval(j.id);
          }
        }
      }
    } catch {
      /* ignore */
    }
    this.notify();
    this.pumpQueue();
  }

  private persist(): void {
    this.lastPersistAt = Date.now();
    void set(QUEUE_STORAGE_KEY, this.jobs).catch(() => {});
    this.notify();
  }

  /** Прогресс приходит на каждый чанк — IDB-запись и re-render не чаще ~3/сек. */
  private persistThrottled(): void {
    if (Date.now() - this.lastPersistAt < 300) return;
    this.persist();
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
    onComplete: (
      book: Book,
      content: string,
      buffer: ArrayBuffer | undefined,
      native?: NativeBookDownloadResult,
    ) => Promise<Book | void>;
    onSaved?: (book: Book) => void;
    onError?: (book: Book, error: string) => void;
  }): void {
    const prevCanDownload = this.canDownload;
    this.serverConfig = opts.serverConfig;
    this.storageDirectory = opts.storageDirectory;
    this.canDownload = opts.canDownload;
    this.onComplete = opts.onComplete;
    this.onSaved = opts.onSaved ?? null;
    this.onError = opts.onError ?? null;
    if (prevCanDownload && !opts.canDownload) {
      this.pauseDownloadsForOffline();
    } else if (!prevCanDownload && opts.canDownload && opts.storageDirectory?.uri) {
      this.resumeDownloadsAfterReconnect();
      this.pumpQueue();
    } else if (opts.canDownload && opts.storageDirectory?.uri) {
      this.pumpQueue();
    }
  }

  private pauseDownloadsForOffline(): void {
    this.offlinePaused = true;
    for (const controller of this.abortControllers.values()) {
      controller.abort();
    }
    for (const job of this.jobs) {
      if (job.status === 'queued') {
        job.status = 'error';
        job.error = DOWNLOAD_OFFLINE_MSG;
        job.finishedAt = Date.now();
      }
    }
    this.persist();
  }

  private resumeDownloadsAfterReconnect(): void {
    this.offlinePaused = false;
    for (const job of this.jobs) {
      if (job.status === 'error' && job.error === DOWNLOAD_OFFLINE_MSG) {
        job.status = 'queued';
        job.error = null;
        job.progress = 0;
        job.finishedAt = null;
      }
    }
    this.persist();
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

  /** True if cancel/remove requested for this book (including mid-save). */
  isAborted(bookId: string): boolean {
    return this.cancelledIds.has(bookId) || Boolean(this.abortControllers.get(bookId)?.signal.aborted);
  }

  enqueue(book: Book): void {
    if (this.abortControllers.has(book.id)) {
      this.pendingEnqueue.set(book.id, book);
      return;
    }
    if (this.jobs.some((j) => j.id === book.id && (j.status === 'queued' || j.status === 'downloading' || j.status === 'saving'))) {
      return;
    }
    // Drop finished markers so re-download works after file was removed externally
    // or local meta was cleared. Active jobs already returned above.
    const finishedTimer = this.finishedCleanupTimers.get(book.id);
    if (finishedTimer != null) {
      window.clearTimeout(finishedTimer);
      this.finishedCleanupTimers.delete(book.id);
    }
    this.jobs = this.jobs.filter(
      (j) => j.id !== book.id || (j.status !== 'saved' && j.status !== 'error' && j.status !== 'cancelled'),
    );
    this.cancelledIds.delete(book.id);
    this.pendingEnqueue.delete(book.id);
    const existing = this.jobs.find((j) => j.id === book.id);
    if (existing) {
      existing.status = 'queued';
      existing.error = null;
      existing.progress = 0;
      existing.book = book;
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
    const job = this.jobs.find((j) => j.id === bookId);
    const wasQueuedOnly = job?.status === 'queued';
    this.cancelledIds.add(bookId);
    this.abortControllers.get(bookId)?.abort();
    if (job && (job.status === 'queued' || job.status === 'downloading')) {
      job.status = 'cancelled';
      job.finishedAt = Date.now();
      // Queued jobs never enter runJob.finally — prune their history entry here.
      if (wasQueuedOnly) this.scheduleFinishedRemoval(bookId);
      this.persist();
    }
    // No in-flight runJob → clear sticky cancel so isAborted/enqueue stay correct.
    if (!this.abortControllers.has(bookId)) this.cancelledIds.delete(bookId);
  }

  retry(bookId: string): void {
    const job = this.jobs.find((j) => j.id === bookId);
    if (!job) return;
    // Don't restart while an aborted fetch is still unwinding — queue for finally.
    if (this.abortControllers.has(bookId)) {
      this.pendingEnqueue.set(bookId, job.book);
      return;
    }
    job.status = 'queued';
    job.error = null;
    job.progress = 0;
    this.cancelledIds.delete(bookId);
    this.persist();
    this.pumpQueue();
  }

  remove(bookId: string): void {
    this.cancelledIds.add(bookId);
    this.abortControllers.get(bookId)?.abort();
    this.jobs = this.jobs.filter((j) => j.id !== bookId);
    this.persist();
    // No in-flight runJob → clear sticky cancel immediately.
    if (!this.abortControllers.has(bookId)) this.cancelledIds.delete(bookId);
  }

  clearFinished(): void {
    for (const timer of this.finishedCleanupTimers.values()) {
      window.clearTimeout(timer);
    }
    this.finishedCleanupTimers.clear();
    this.jobs = this.jobs.filter((j) => j.status === 'queued' || j.status === 'downloading' || j.status === 'saving');
    this.persist();
  }

  private pumpQueue(): void {
    if (!this.canDownload || !this.storageDirectory?.uri || !this.serverConfig || !this.onComplete) {
      return;
    }
    while (this.activeCount < MAX_CONCURRENT_DOWNLOADS) {
      const next = this.jobs.find(
        (j) => j.status === 'queued' && !this.abortControllers.has(j.id),
      );
      if (!next) break;
      this.activeCount++;
      void this.runJob(next);
    }
  }

  private scheduleFinishedRemoval(bookId: string): void {
    const prev = this.finishedCleanupTimers.get(bookId);
    if (prev != null) window.clearTimeout(prev);
    const timer = window.setTimeout(() => {
      this.finishedCleanupTimers.delete(bookId);
      const job = this.jobs.find((j) => j.id === bookId);
      if (!job) return;
      // Keep errors until user clears/retries; only prune successful/cancelled history.
      if (job.status === 'saved' || job.status === 'cancelled') {
        this.jobs = this.jobs.filter((j) => j.id !== bookId);
        this.persist();
      }
    }, FINISHED_HISTORY_MS);
    this.finishedCleanupTimers.set(bookId, timer);
  }

  private applyTransferProgress(job: DownloadJob, loaded: number, total: number): void {
    job.bytesLoaded = loaded;
    job.bytesTotal = total || job.book.size || loaded;
    // Leave headroom for saving (95–100); avoid a long sticky 88%.
    job.progress =
      total > 0
        ? Math.min(94, Math.max(5, Math.round((loaded / total) * 94)))
        : Math.min(40, Math.max(job.progress, 5) + 2);
    const elapsed = (Date.now() - (job.startedAt ?? Date.now())) / 1000;
    job.speedBps = elapsed > 0 ? loaded / elapsed : 0;
    const now = Date.now();
    // Persist не чаще ~3/сек (IDB + re-render); OS-уведомление — раз в 400 мс.
    this.persistThrottled();
    if (now - this.lastProgressNotifyAt >= 400) {
      this.lastProgressNotifyAt = now;
      void notifyDownloadProgress(job.book.title, job.progress);
    }
  }

  private async runJob(next: DownloadJob): Promise<void> {
    const wasIdle = this.activeCount === 1;
    const controller = new AbortController();
    this.abortControllers.set(next.id, controller);
    next.status = 'downloading';
    next.startedAt = Date.now();
    next.error = null;
    this.persist();
    if (wasIdle) void notifyDownloadStart(next.book.title);

    // Нативная загрузка стримит сразу в финальный путь — при сбое/отмене
    // частичный файл нужно удалить, иначе он останется мусором на диске.
    let nativeTargetPath: string | null = null;

    try {
      if (this.cancelledIds.has(next.id) || controller.signal.aborted) throw new Error('Отменено');

      const access = await checkStorageAccess(this.storageDirectory);
      if (!access.ok) throw new Error(STORAGE_PERMISSION_REVOKED_MSG);

      await assertEnoughStorage(this.estimateRequiredBytes());

      const enriched = await enrichBookForDownload(this.serverConfig!, next.book);

      let chaptersJson = '[]';
      let nativeResult: NativeBookDownloadResult | undefined;

      if (isNativeApp()) {
        nativeTargetPath = bookStorageRelativePath(enriched);
        nativeResult = await this.fetchNative(next, controller, enriched);
        await assertDownloadedBookReadableNative(this.storageDirectory!, enriched, nativeResult.relativePath);
      } else {
        const buffer = await this.fetchWithProgress(next, controller);
        assertDownloadedBookReadable(enriched, buffer);
        chaptersJson = await buildChaptersJson(enriched, buffer);
        if (
          this.cancelledIds.has(next.id)
          || controller.signal.aborted
          || !this.jobs.some((j) => j.id === next.id)
        ) {
          throw new Error('Отменено');
        }
        next.status = 'saving';
        next.progress = 95;
        this.persist();

        const savedBook = await this.onComplete!(enriched, chaptersJson, buffer);
        next.status = 'saved';
        next.progress = 100;
        next.finishedAt = Date.now();
        try {
          const openBook =
            savedBook && typeof savedBook === 'object' && 'id' in savedBook
              ? (savedBook as Book)
              : enriched;
          this.onSaved?.(openBook);
        } catch {
          /* ignore UI callback errors */
        }
        return;
      }

      next.status = 'saving';
      next.progress = 95;
      this.persist();

      if (
        this.cancelledIds.has(next.id)
        || controller.signal.aborted
        || !this.jobs.some((j) => j.id === next.id)
      ) {
        throw new Error('Отменено');
      }

      const savedBook = await this.onComplete!(enriched, chaptersJson, undefined, nativeResult);
      // File + library meta already committed — ignore late cancel so UI matches disk.

      next.status = 'saved';
      next.progress = 100;
      next.finishedAt = Date.now();
      try {
        // Prefer the persisted record (has localFileName/storageUri) — React state may not
        // have flushed yet when the user taps «Открыть» on the snackbar.
        const openBook =
          savedBook && typeof savedBook === 'object' && 'id' in savedBook
            ? (savedBook as Book)
            : enriched;
        this.onSaved?.(openBook);
      } catch {
        /* ignore UI callback errors */
      }
    } catch (err) {
      if (nativeTargetPath) {
        // Сбой/отмена нативной загрузки — подчистить частичный файл.
        await removeBookFromDirectory(this.storageDirectory!, nativeTargetPath).catch(() => {});
      }
      if (this.cancelledIds.has(next.id)) {
        next.status = 'cancelled';
      } else if (controller.signal.aborted && this.offlinePaused) {
        // Abort пришёл от pauseDownloadsForOffline — та же семантика, что у
        // queued-задач, чтобы resumeDownloadsAfterReconnect подхватил задачу.
        next.status = 'error';
        next.error = DOWNLOAD_OFFLINE_MSG;
      } else if (controller.signal.aborted) {
        next.status = 'error';
        next.error = 'Загрузка прервана: нет данных от сервера';
      } else {
        next.status = 'error';
        next.error = isStoragePermissionError(err)
          ? STORAGE_PERMISSION_REVOKED_MSG
          : isAuthError(err)
            ? (err instanceof Error ? err.message : 'Сессия устройства устарела')
            : err instanceof Error
              ? err.message
              : 'Ошибка загрузки';
        try {
          this.onError?.(next.book, next.error);
        } catch {
          /* ignore UI callback errors */
        }
      }
      next.finishedAt = Date.now();
    } finally {
      this.abortControllers.delete(next.id);
      this.cancelledIds.delete(next.id);
      if (next.status === 'saved' || next.status === 'cancelled') {
        this.scheduleFinishedRemoval(next.id);
      }
      this.activeCount = Math.max(0, this.activeCount - 1);
      this.persist();
      const pending = this.pendingEnqueue.get(next.id);
      if (pending) {
        this.pendingEnqueue.delete(next.id);
        this.enqueue(pending);
      }
      const hasPending = this.jobs.some((j) => j.status === 'queued' || j.status === 'downloading' || j.status === 'saving');
      if (!hasPending) void notifyDownloadStop();
      this.pumpQueue();
    }
  }

  private estimateRequiredBytes(): number {
    return this.jobs
      .filter((j) => j.status === 'queued' || j.status === 'downloading' || j.status === 'saving')
      .reduce((sum, j) => {
        const full = j.book.size ?? 512 * 1024;
        // У активной загрузки часть байт уже на диске — не требуем их повторно.
        const remaining = j.status === 'downloading' ? Math.max(0, full - j.bytesLoaded) : full;
        return sum + remaining;
      }, 0);
  }

  private async fetchWithProgress(job: DownloadJob, controller: AbortController): Promise<ArrayBuffer> {
    const signal = controller.signal;
    const start = Date.now();
    job.bytesLoaded = 0;
    job.bytesTotal = job.book.size ?? 0;
    job.progress = 5;
    this.persist();
    void notifyDownloadProgress(job.book.title, job.progress);

    let lastProgressAt = Date.now();
    const stallCheck = window.setInterval(() => {
      if (signal.aborted) return;
      if (Date.now() - lastProgressAt > DOWNLOAD_STALL_MS) {
        controller.abort();
      }
    }, 5000);

    try {
      const buffer = await fetchBookBinary(
        this.serverConfig!,
        job.book,
        (loaded, total) => {
          if (signal.aborted) return;
          lastProgressAt = Date.now();
          this.applyTransferProgress(job, loaded, total);
        },
        { signal },
      );
      job.bytesLoaded = buffer.byteLength;
      job.bytesTotal = buffer.byteLength;
      const elapsed = (Date.now() - start) / 1000;
      job.speedBps = elapsed > 0 ? buffer.byteLength / elapsed : 0;
      job.progress = 90;
      this.persist();
      void notifyDownloadProgress(job.book.title, job.progress);
      return buffer;
    } finally {
      window.clearInterval(stallCheck);
    }
  }

  private async fetchNative(
    job: DownloadJob,
    controller: AbortController,
    book: Book = job.book,
  ): Promise<NativeBookDownloadResult> {
    const signal = controller.signal;
    const start = Date.now();
    job.bytesLoaded = 0;
    job.bytesTotal = job.book.size ?? 0;
    job.progress = 5;
    this.persist();
    void notifyDownloadProgress(job.book.title, job.progress);

    let lastProgressAt = Date.now();
    const stallCheck = window.setInterval(() => {
      if (signal.aborted) return;
      if (Date.now() - lastProgressAt > DOWNLOAD_STALL_MS) {
        controller.abort();
      }
    }, 5000);

    try {
      const result = await downloadBookToStorageNative(
        this.serverConfig!,
        book,
        this.storageDirectory!,
        job.id,
        (loaded, total) => {
          if (signal.aborted) return;
          lastProgressAt = Date.now();
          this.applyTransferProgress(job, loaded, total);
        },
        signal,
      );
      job.bytesLoaded = result.byteLength;
      job.bytesTotal = result.byteLength;
      const elapsed = (Date.now() - start) / 1000;
      job.speedBps = elapsed > 0 ? result.byteLength / elapsed : 0;
      job.progress = 90;
      this.persist();
      void notifyDownloadProgress(job.book.title, job.progress);
      return result;
    } finally {
      window.clearInterval(stallCheck);
    }
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
