import React from 'react';
import { downloadQueue, type DownloadJob } from '../lib/downloadQueue';

export function useDownloadQueue(): DownloadJob[] {
  const [jobs, setJobs] = React.useState<DownloadJob[]>(() => downloadQueue.getJobs());

  React.useEffect(() => {
    void downloadQueue.hydrate().then(() => setJobs(downloadQueue.getJobs()));
    return downloadQueue.subscribe(() => setJobs(downloadQueue.getJobs()));
  }, []);

  return jobs;
}

export function useIsBookDownloading(bookId: string): boolean {
  const jobs = useDownloadQueue();
  return jobs.some(
    (j) => j.id === bookId && (j.status === 'queued' || j.status === 'downloading' || j.status === 'saving'),
  );
}
