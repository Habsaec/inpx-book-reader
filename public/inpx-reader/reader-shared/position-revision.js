import { savedFraction } from '../position-sync.js';

export const POSITION_VERSION = 4;

function revision(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}

function nullableNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nullableText(value) {
  return value == null ? null : String(value);
}

function hasExplicitFraction(value) {
  return value != null
    && !(typeof value === 'string' && value.trim() === '');
}

export function positionFields(snapshot) {
  const source = snapshot || {};
  return {
    position: String(source.position || ''),
    progress: Number(source.progress) || 0,
    fraction: hasExplicitFraction(source.fraction) && Number.isFinite(Number(source.fraction))
      ? Number(source.fraction)
      : savedFraction(source),
    fb2Href: source.fb2Href ? String(source.fb2Href) : null,
    sectionIndex: nullableNumber(source.sectionIndex),
    sectionPageFraction: nullableNumber(source.sectionPageFraction),
    paginatorPage: nullableNumber(source.paginatorPage),
    paginatorPages: nullableNumber(source.paginatorPages),
    layoutMode: typeof source.layoutMode === 'string' && source.layoutMode
      ? source.layoutMode
      : null,
    textOffset: nullableNumber(source.textOffset),
    textQuote: nullableText(source.textQuote),
    textSectionLength: nullableNumber(source.textSectionLength),
  };
}

export function hasMeaningfulPosition(snapshot) {
  const fields = positionFields(snapshot);
  return fields.fraction > 0.02
    || Boolean(fields.position.trim())
    || Boolean(fields.fb2Href)
    || (fields.sectionIndex != null && fields.textOffset != null)
    || fields.paginatorPage != null
    || (fields.sectionIndex != null && fields.sectionPageFraction != null);
}

export function positionsDiffer(left, right) {
  const a = positionFields(left);
  const b = positionFields(right);
  const aHasTextAnchor = a.sectionIndex != null && a.textOffset != null;
  const bHasTextAnchor = b.sectionIndex != null && b.textOffset != null;
  if (aHasTextAnchor || bHasTextAnchor) {
    if (!aHasTextAnchor || !bHasTextAnchor) return true;
    return a.sectionIndex !== b.sectionIndex || a.textOffset !== b.textOffset;
  }
  if (Math.abs(a.fraction - b.fraction) > 1e-5) return true;
  if ((a.position || b.position) && a.position !== b.position) return true;
  if ((a.fb2Href || b.fb2Href) && a.fb2Href !== b.fb2Href) return true;
  return false;
}

export function normalizeSeenContext(raw, { isFb2 = false } = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const version = revision(source.positionVersion) || 1;
  if (version < POSITION_VERSION) {
    if (isFb2) {
      return {
        positionVersion: POSITION_VERSION,
        baseRevision: 0,
        serverRevision: 0,
        positionDirty: false,
        ...positionFields(null),
        updatedAt: null,
        serverUpdatedAt: null,
        dismissedUpdatedAt: null,
        dismissedServerRevision: null,
      };
    }
    const compatibleFields = positionFields({ position: source.position });
    return {
      ...source,
      ...compatibleFields,
      positionVersion: POSITION_VERSION,
      baseRevision: 0,
      serverRevision: 0,
      positionDirty: hasMeaningfulPosition(compatibleFields),
      dismissedUpdatedAt: source.dismissedUpdatedAt || null,
      dismissedServerRevision: null,
    };
  }
  const serverRevision = revision(source.serverRevision);
  const inferredBaseRevision =
    source.dismissedUpdatedAt || source.pendingServerPosition
      ? 0
      : serverRevision;
  return {
    ...source,
    ...positionFields(source),
    positionVersion: POSITION_VERSION,
    baseRevision: Object.prototype.hasOwnProperty.call(source, 'baseRevision')
      ? revision(source.baseRevision)
      : inferredBaseRevision,
    serverRevision,
    positionDirty: Boolean(source.positionDirty),
    dismissedUpdatedAt: source.dismissedUpdatedAt || null,
    dismissedServerRevision: source.dismissedServerRevision == null
      ? null
      : revision(source.dismissedServerRevision),
  };
}

export function decidePositionOnOpen(local, server) {
  const localCtx = normalizeSeenContext(local);
  const serverRevision = revision(server?.revision);
  if (serverRevision < localCtx.baseRevision) return 'local';
  if (!localCtx.positionDirty) {
    if (
      localCtx.dismissedServerRevision === serverRevision
      && positionsDiffer(localCtx, server)
    ) {
      return 'local';
    }
    if (
      serverRevision > localCtx.baseRevision
      && hasMeaningfulPosition(localCtx)
      && positionsDiffer(localCtx, server)
    ) {
      return 'prompt';
    }
    return serverRevision > localCtx.baseRevision || positionsDiffer(localCtx, server)
      ? 'server'
      : 'local';
  }
  if (serverRevision !== localCtx.baseRevision) {
    return positionsDiffer(localCtx, server) ? 'prompt' : 'server';
  }
  return 'local';
}

export function markPositionDirty(local, payload, changedAt = new Date().toISOString()) {
  const current = normalizeSeenContext(local);
  return {
    ...current,
    ...positionFields({ ...current, ...payload }),
    positionVersion: POSITION_VERSION,
    positionDirty: true,
    updatedAt: changedAt,
    dismissedUpdatedAt: null,
    dismissedServerRevision: null,
  };
}

export function acceptServerPosition(local, server) {
  const serverRevision = revision(server?.revision);
  return {
    ...normalizeSeenContext(local),
    ...positionFields(server),
    positionVersion: POSITION_VERSION,
    baseRevision: serverRevision,
    serverRevision,
    positionDirty: false,
    updatedAt: server?.updatedAt || new Date().toISOString(),
    serverUpdatedAt: server?.updatedAt || null,
    serverProgress: Number(server?.progress) || 0,
    dismissedUpdatedAt: null,
    dismissedServerRevision: null,
    pendingServerPosition: null,
  };
}

export function acceptPositionSave(local, sent, response, sentChangedAt) {
  const current = normalizeSeenContext(local);
  const acceptedRevision = revision(response?.revision);
  const stillCurrent = current.updatedAt === sentChangedAt && !positionsDiffer(current, sent);
  return {
    ...current,
    ...(stillCurrent ? positionFields(sent) : {}),
    positionVersion: POSITION_VERSION,
    baseRevision: acceptedRevision,
    serverRevision: acceptedRevision,
    positionDirty: !stillCurrent,
    updatedAt: stillCurrent
      ? (response?.updatedAt || sentChangedAt || new Date().toISOString())
      : current.updatedAt,
    serverUpdatedAt: response?.updatedAt || null,
    serverProgress: Number(sent?.progress) || 0,
    dismissedUpdatedAt: null,
    dismissedServerRevision: null,
    pendingServerPosition: null,
  };
}

export function observeServerConflict(local, server) {
  const current = normalizeSeenContext(local);
  return {
    ...current,
    positionVersion: POSITION_VERSION,
    serverRevision: Math.max(current.serverRevision, revision(server?.revision)),
    positionDirty: true,
    serverUpdatedAt: server?.updatedAt || current.serverUpdatedAt || null,
    serverProgress: Number(server?.progress) || 0,
    pendingServerPosition: {
      ...positionFields(server),
      updatedAt: server?.updatedAt || null,
      positionVersion: POSITION_VERSION,
      revision: revision(server?.revision),
    },
  };
}

export function dismissServerPosition(local, server) {
  const current = normalizeSeenContext(local);
  const currentServerRevision = revision(server?.revision);
  return {
    ...current,
    positionVersion: POSITION_VERSION,
    baseRevision: currentServerRevision,
    serverRevision: Math.max(current.serverRevision, currentServerRevision),
    positionDirty: false,
    serverUpdatedAt: server?.updatedAt || current.serverUpdatedAt || null,
    serverProgress: Number(server?.progress) || 0,
    dismissedUpdatedAt: server?.updatedAt || null,
    dismissedServerRevision: currentServerRevision,
    pendingServerPosition: null,
  };
}
