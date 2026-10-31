import React from 'react';

/**
 * Home layout of the account — shared with the web «Профиль → Вид → Главная страница»
 * (`/api/preferences.homeLayout`): `order` lists every section, `hidden` the switched-off ones.
 * `recent` («Недавно читали») exists only in the app; the web keeps its place in `order`.
 * Cached in localStorage so the home renders in the right order offline and before the profile loads.
 */
export const HOME_SECTION_IDS = ['continue', 'recent', 'novinki', 'recommended', 'following', 'shelves'] as const;
export type HomeSectionId = (typeof HOME_SECTION_IDS)[number];

export const HOME_SECTION_LABELS: Record<HomeSectionId, string> = {
  continue: 'Продолжить чтение',
  recent: 'Недавно читали',
  novinki: 'Новинки',
  recommended: 'Рекомендации',
  following: 'Новое у любимых',
  shelves: 'Закреплённые полки',
};

export interface HomeLayout {
  order: HomeSectionId[];
  hidden: HomeSectionId[];
}

const STORAGE_KEY = 'inpx_home_layout';
const KNOWN = new Set<string>(HOME_SECTION_IDS);

function idList(value: unknown): HomeSectionId[] {
  if (!Array.isArray(value)) return [];
  const out: HomeSectionId[] = [];
  for (const item of value) {
    const id = String(item || '');
    if (KNOWN.has(id) && !out.includes(id as HomeSectionId)) out.push(id as HomeSectionId);
  }
  return out;
}

/** Same rules as the server's `normalizeHomeLayout` (missing sections return to their default place). */
export function normalizeHomeLayout(raw: unknown): HomeLayout {
  const input = (raw && typeof raw === 'object' ? raw : {}) as { order?: unknown; hidden?: unknown };
  const order = idList(input.order);
  HOME_SECTION_IDS.forEach((id, index) => {
    if (order.includes(id)) return;
    const before = HOME_SECTION_IDS.slice(0, index).reverse().find((prev) => order.includes(prev));
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, id);
  });
  return { order, hidden: idList(input.hidden) };
}

function readStored(): HomeLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return normalizeHomeLayout(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeHomeLayout(null);
  }
}

let value = readStored();
const listeners = new Set<() => void>();

export function getHomeLayout(): HomeLayout {
  return value;
}

export function setHomeLayout(next: unknown): void {
  const normalized = normalizeHomeLayout(next);
  if (JSON.stringify(normalized) === JSON.stringify(value)) return;
  value = normalized;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    /* storage unavailable — keep the in-memory value */
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useHomeLayout(): HomeLayout {
  return React.useSyncExternalStore(subscribe, () => value, () => value);
}

export function isHomeSectionVisible(layout: HomeLayout, id: HomeSectionId): boolean {
  return !layout.hidden.includes(id);
}

export function toggleHomeSection(layout: HomeLayout, id: HomeSectionId, visible: boolean): HomeLayout {
  const hidden = layout.hidden.filter((item) => item !== id);
  return { order: layout.order.slice(), hidden: visible ? hidden : [...hidden, id] };
}

export function moveHomeSection(layout: HomeLayout, id: HomeSectionId, direction: 'up' | 'down'): HomeLayout {
  const order = layout.order.slice();
  const pos = order.indexOf(id);
  const target = direction === 'up' ? pos - 1 : pos + 1;
  if (pos < 0 || target < 0 || target >= order.length) return layout;
  [order[pos], order[target]] = [order[target], order[pos]];
  return { order, hidden: layout.hidden.slice() };
}
