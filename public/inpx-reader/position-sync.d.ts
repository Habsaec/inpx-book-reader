export const READING_POSITION_SCALE: number;
export const PROGRESS_PERCENT_SCALE: number;
export const IDLE_MS: number;
export const USER_POSITION_SAVE_REASONS: readonly string[];

export function parseSyncTs(iso: string | null | undefined): number;
export function normalizeSessionId(value: string | null | undefined): string | null;
export function sessionStatusFromActivityAt(
  lastUserActivityAt: string | null | undefined,
  nowMs?: number,
): 'active' | 'idle';
export function isUserPositionSaveReason(reason: string | null | undefined): boolean;
export function shouldIdleSteal(
  current: { sessionId?: string | null; lastUserActivityAt?: string | null } | null | undefined,
  incomingSessionId: string | null | undefined,
  nowMs?: number,
): boolean;
export function canOverwriteHolder(
  current: { sessionId?: string | null; lastUserActivityAt?: string | null } | null | undefined,
  incomingSessionId: string | null | undefined,
  nowMs?: number,
): boolean;
export function normalizeReadingFraction(fraction: number): number;
export function progressToFraction(progress: number): number;
export function fractionToProgress(fraction: number): number;
export function parseFb2HrefParts(href: string | null | undefined): { section: number; blockId: number | null };
export function isFb2HrefFormat(href: string | null | undefined): boolean;
export function compareFb2Hrefs(a: string | null | undefined, b: string | null | undefined): number;
export function fractionFromFb2HrefWithToc(href: string, tocHrefs?: string[]): number | null;
export function effectiveSavedFraction(saved: { fraction?: number; progress?: number; fb2Href?: string | null } | null | undefined, tocHrefs?: string[]): number;
export type FlatTocEntry =
  | string
  | { href?: string | null; label?: string | null; startFraction?: number | null };
export interface PositionDisplayMetaShape {
  fb2Href?: string | null;
  position?: string | null;
  paginatorPage?: number | null;
  paginatorPages?: number | null;
  sectionIndex?: number | null;
  chapterLabel?: string | null;
}
export function tocChapterLabelForPosition(
  saved: Record<string, unknown> | null | undefined,
  flatToc?: FlatTocEntry[] | null,
): string;
export function formatPositionDetail(meta?: PositionDisplayMetaShape | null): string;
export function resolvePositionDisplayMeta(
  saved: Record<string, unknown> | null | undefined,
  flatToc?: FlatTocEntry[] | null,
): PositionDisplayMetaShape;
export function formatPositionProgressLabel(
  fraction: number,
  progress: number,
  meta?: PositionDisplayMetaShape | null,
): string;
export function buildCrossDevicePromptLines(
  localCtx: Record<string, unknown> | null | undefined,
  serverPos: Record<string, unknown> | null | undefined,
  flatToc?: FlatTocEntry[] | null,
): { localLine: string; serverLine: string };

export interface PositionMergeInput {
  skipPosition?: boolean;
  localFraction: number;
  localPosition: string;
  localFb2Href?: string | null;
  localSectionIndex?: number | null;
  localTextOffset?: number | null;
  localPositionRev: string | null;
  localHasPaginator: boolean;
  serverFraction: number;
  serverProgress: number;
  serverPosition: string;
  serverFb2Href?: string | null;
  serverSectionIndex?: number | null;
  serverTextOffset?: number | null;
  serverPosUpdatedAt: string | null;
  localServerPositionUpdatedAt: string | null;
  localServerPositionProgress: number;
  localServerPositionFraction?: number;
  dismissedServerPositionUpdatedAt?: string | null;
}

export function hasMeaningfulServerPosition(input: PositionMergeInput): boolean;
export function hasMeaningfulLocalPosition(input: PositionMergeInput): boolean;
export function positionsMeaningfullyDiffer(
  localFraction: number,
  localPosition: string,
  localFb2Href: string | null | undefined,
  serverFraction: number,
  serverPosition: string,
  serverFb2Href: string | null | undefined,
  localTextOffset?: number | null,
  serverTextOffset?: number | null,
  localSectionIndex?: number | null,
  serverSectionIndex?: number | null,
): boolean;
export function serverPositionChangedSinceLastSync(input: PositionMergeInput): boolean;
export function shouldUseServerPosition(input: PositionMergeInput): boolean;
export function serverEditUnseenOnThisClient(input: PositionMergeInput): boolean;
export function shouldShowCrossDevicePositionPrompt(input: PositionMergeInput): boolean;
export function needsDeferredCrossDevicePromptFromStore(store: Record<string, unknown>): boolean;
export function savedFraction(saved: { fraction?: number; progress?: number } | null | undefined): number;
export function buildMergeInputFromOfflineStore(store: Record<string, unknown>): PositionMergeInput;
export function buildCrossDevicePromptDetailsFromStore(store: Record<string, unknown>): { localLine: string; serverLine: string };
export function buildMergeInputFromLocalCtx(
  localCtx: Record<string, unknown> | null | undefined,
  serverPos: Record<string, unknown> | null | undefined,
): PositionMergeInput;
export function localCtxFromSaved(saved: Record<string, unknown> | null | undefined): Record<string, unknown> | null;
