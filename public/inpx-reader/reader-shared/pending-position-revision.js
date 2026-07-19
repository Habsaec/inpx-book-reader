export function acceptPendingPositionRevision(store) {
  store.positionVersion = 4;
  const revision = Number(store?.serverRevision);
  if (Number.isInteger(revision) && revision >= 0) {
    store.baseRevision = revision;
  }
  store.positionDirty = false;
  store.dismissedServerRevision = null;
  return store;
}

export function declinePendingPositionRevision(store) {
  store.positionVersion = 4;
  const revision = Number(store?.serverRevision);
  if (Number.isInteger(revision) && revision >= 0) {
    store.baseRevision = revision;
    store.dismissedServerRevision = revision;
  }
  store.positionDirty = false;
  return store;
}

export function completePendingPositionRestore(store, restored) {
  if (restored === false) return false;
  acceptPendingPositionRevision(store);
  return true;
}
