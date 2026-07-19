export function acceptPendingPositionRevision<T extends {
  positionVersion?: number;
  serverRevision?: number;
  baseRevision?: number;
  positionDirty?: boolean;
  dismissedServerRevision?: number | null;
}>(store: T): T;

export function declinePendingPositionRevision<T extends {
  positionVersion?: number;
  baseRevision?: number;
  serverRevision?: number;
  positionDirty?: boolean;
  dismissedServerRevision?: number | null;
}>(store: T): T;

export function completePendingPositionRestore<T extends {
  positionVersion?: number;
  serverRevision?: number;
  baseRevision?: number;
  positionDirty?: boolean;
  dismissedServerRevision?: number | null;
}>(store: T, restored: boolean): boolean;
