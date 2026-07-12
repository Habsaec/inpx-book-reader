const SESSION_ID = '756f1e';
export const DEBUG_SESSION_STORAGE_KEY = 'debug_session_756f1e';
const MAX_LOG_ENTRIES = 80;

const SENSITIVE_KEY_RE =
  /password|passwd|token|secret|credential|authorization|auth|api[_-]?key|device[_-]?token/i;

function redactString(value: string): string {
  return value.replace(/\/\/[^@\s/]+@/g, '//***@');
}

function redactValue(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (typeof value === 'object') return redactDebugData(value as Record<string, unknown>);
  return value;
}

export function redactDebugData(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEY_RE.test(key)) {
      out[key] = '***';
      continue;
    }
    out[key] = redactValue(value);
  }
  return out;
}

export interface DebugSessionEntry {
  sessionId: string;
  hypothesisId: string;
  location: string;
  message: string;
  data: Record<string, unknown>;
  timestamp: number;
}

export function getDebugRequestId(): string {
  return `${SESSION_ID}-${Date.now().toString(36)}`;
}

export function readDebugSessionLog(): DebugSessionEntry[] {
  try {
    const raw = localStorage.getItem(DEBUG_SESSION_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as DebugSessionEntry[]) : [];
  } catch {
    return [];
  }
}

export function clearDebugSessionLog(): void {
  try {
    localStorage.removeItem(DEBUG_SESSION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function appendDebugSessionLog(entry: DebugSessionEntry): void {
  try {
    const arr = readDebugSessionLog();
    arr.push(entry);
    if (arr.length > MAX_LOG_ENTRIES) arr.splice(0, arr.length - MAX_LOG_ENTRIES);
    localStorage.setItem(DEBUG_SESSION_STORAGE_KEY, JSON.stringify(arr));
  } catch {
    /* ignore */
  }
}

export function debugSessionLog(
  hypothesisId: string,
  location: string,
  message: string,
  data: Record<string, unknown> = {},
): void {
  const payload: DebugSessionEntry = {
    sessionId: SESSION_ID,
    hypothesisId,
    location,
    message,
    data: redactDebugData(data),
    timestamp: Date.now(),
  };

  appendDebugSessionLog(payload);
}
