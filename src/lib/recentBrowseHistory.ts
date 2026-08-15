/** Local recent authors/series taps for catalog landing. */

const LS_KEY = 'inpx_recent_browse_v1';
const MAX = 8;

export type RecentBrowseKind = 'author' | 'series';

export interface RecentBrowseItem {
  kind: RecentBrowseKind;
  name: string;
  displayName?: string;
  at: number;
}

function readAll(): RecentBrowseItem[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentBrowseItem[];
    return Array.isArray(parsed) ? parsed.filter((x) => x && (x.kind === 'author' || x.kind === 'series') && x.name) : [];
  } catch {
    return [];
  }
}

function writeAll(items: RecentBrowseItem[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items.slice(0, MAX)));
  } catch {
    /* ignore */
  }
}

export function getRecentBrowse(limit = MAX): RecentBrowseItem[] {
  return readAll().slice(0, limit);
}

export function pushRecentBrowse(item: Omit<RecentBrowseItem, 'at'>): RecentBrowseItem[] {
  const next: RecentBrowseItem[] = [
    { ...item, at: Date.now() },
    ...readAll().filter((x) => !(x.kind === item.kind && x.name === item.name)),
  ].slice(0, MAX);
  writeAll(next);
  return next;
}
