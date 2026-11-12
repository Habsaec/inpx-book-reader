import React from 'react';
import { downloadQueue, type DownloadJob } from '../lib/downloadQueue';

/**
 * Jobs of the download queue. By default the component re-renders only when a job is added,
 * removed or changes status; `live` also follows the byte progress (queue sheet / widget).
 */
export function useDownloadQueue(live = false): DownloadJob[] {
  const [jobs, setJobs] = React.useState<DownloadJob[]>(() => downloadQueue.getJobs());
  const mountedRef = React.useRef(true);

  React.useEffect(() => {
    mountedRef.current = true;
    const update = () => {
      if (mountedRef.current) setJobs(downloadQueue.getJobs());
    };
    void downloadQueue.hydrate().then(update);
    const unsub = downloadQueue.subscribe(update);
    const unsubProgress = live ? downloadQueue.subscribeProgress(update) : undefined;
    return () => {
      mountedRef.current = false;
      unsub();
      unsubProgress?.();
    };
  }, [live]);

  return jobs;
}

/** Percent of one running download; subscribes only while `active`, so idle tiles cost nothing. */
export function useBookDownloadProgress(bookId: string, active: boolean): number {
  const read = () => (active ? downloadQueue.getJob(bookId)?.progress ?? 0 : 0);
  const [progress, setProgress] = React.useState(read);

  React.useEffect(() => {
    if (!active) {
      setProgress(0);
      return undefined;
    }
    const update = () => setProgress(downloadQueue.getJob(bookId)?.progress ?? 0);
    update();
    const unsub = downloadQueue.subscribe(update);
    const unsubProgress = downloadQueue.subscribeProgress(update);
    return () => {
      unsub();
      unsubProgress();
    };
  }, [bookId, active]);

  return progress;
}

export function useIsBookDownloading(bookId: string): boolean {
  const jobs = useDownloadQueue();
  return jobs.some(
    (j) => j.id === bookId && (j.status === 'queued' || j.status === 'downloading' || j.status === 'saving'),
  );
}
