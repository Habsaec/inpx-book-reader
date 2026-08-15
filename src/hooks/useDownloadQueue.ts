import React from 'react';
import { downloadQueue, type DownloadJob } from '../lib/downloadQueue';

export function useDownloadQueue(): DownloadJob[] {
  const [jobs, setJobs] = React.useState<DownloadJob[]>(() => downloadQueue.getJobs());
  const mountedRef = React.useRef(true);

  React.useEffect(() => {
    mountedRef.current = true;
    void downloadQueue.hydrate().then(() => {
      if (mountedRef.current) setJobs(downloadQueue.getJobs());
    });
    const unsub = downloadQueue.subscribe(() => {
      if (mountedRef.current) setJobs(downloadQueue.getJobs());
    });
    return () => {
      mountedRef.current = false;
      unsub();
    };
  }, []);

  return jobs;
}

export function useIsBookDownloading(bookId: string): boolean {
  const jobs = useDownloadQueue();
  return jobs.some(
    (j) => j.id === bookId && (j.status === 'queued' || j.status === 'downloading' || j.status === 'saving'),
  );
}
