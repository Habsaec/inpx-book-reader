import React from 'react';

/**
 * «Скрыть прочитанное» — one account switch shared with the web UI (`/api/preferences.hideRead`).
 * `null` until the profile says what the server stored (older servers: stays null, nothing is sent).
 * List fetchers send it explicitly (`hideRead=1|0`) so a fresh toggle never races the POST that saves it;
 * screens re-fetch when the epoch changes.
 */
let value: boolean | null = null;
let epoch = 0;
const listeners = new Set<() => void>();

export function getHideRead(): boolean | null {
  return value;
}

export function setHideRead(next: boolean | null): void {
  if (next === value) return;
  value = next;
  epoch += 1;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Changes whenever the switch flips — add to list-fetch effect deps. */
export function useHideReadEpoch(): number {
  return React.useSyncExternalStore(subscribe, () => epoch, () => epoch);
}

export function appendHideReadParam(params: URLSearchParams): void {
  if (value != null) params.set('hideRead', value ? '1' : '0');
}
