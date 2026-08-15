import React from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { theme } from '../lib/appTheme';
import { isUsingIndexedDbFallback, LOCAL_DB_VERSION } from '../lib/localDb';
import { isNativeApp } from '../lib/platform';
import { textStyles, radii, elevation } from '../ui/tokens';
import Button from '../ui/Button';
import { Bug, Copy, Trash2 } from 'lucide-react';
import {
  clearDebugSessionLog,
  debugSessionLog,
  getDebugRequestId,
  readDebugSessionLog,
} from '../lib/debugSessionLog';

interface DiagnosticsTabProps {
  serverUrl: string;
  connectionStatus: string;
  storageLabel: string | null;
  lastSynced: string | null;
}

export default function DiagnosticsTab({
  serverUrl,
  connectionStatus,
  storageLabel,
  lastSynced,
}: DiagnosticsTabProps) {
  const [copied, setCopied] = React.useState(false);
  const [appVersion, setAppVersion] = React.useState<string>('—');
  const [build, setBuild] = React.useState<string>('—');
  const [logCount, setLogCount] = React.useState(0);

  React.useEffect(() => {
    setLogCount(readDebugSessionLog().length);
    if (!Capacitor.isNativePlatform()) return;
    void CapApp.getInfo()
      .then((info) => {
        setAppVersion(info.version || '—');
        setBuild(info.build || '—');
      })
      .catch(() => {});
  }, []);

  const buildReport = () => {
    const logs = readDebugSessionLog();
    const lines = [
      '=== INPX Reader Diagnostics (sanitized) ===',
      'app: INPX Book Reader',
      `version: ${appVersion}`,
      `build: ${build}`,
      `platform: ${Capacitor.getPlatform()}`,
      `native: ${isNativeApp()}`,
      `db: v${LOCAL_DB_VERSION} ${isUsingIndexedDbFallback() ? 'IndexedDB fallback' : 'SQLite'}`,
      `server: ${connectionStatus}`,
      `serverUrl: ${serverUrl.replace(/\/\/[^@]+@/, '//***@')}`,
      `storage: ${storageLabel ?? 'none'}`,
      `lastSync: ${lastSynced ?? 'never'}`,
      `webview: ${navigator.userAgent}`,
      `requestId: ${getDebugRequestId()}`,
      `logEntries: ${logs.length}`,
      '',
      '--- session log ---',
    ];

    for (const entry of logs) {
      const ts = new Date(entry.timestamp).toISOString();
      lines.push(
        `[${ts}] ${entry.hypothesisId} ${entry.location}: ${entry.message} ${JSON.stringify(entry.data)}`,
      );
    }

    return lines.join('\n');
  };

  const copiedTimer = React.useRef<number | null>(null);
  React.useEffect(
    () => () => {
      if (copiedTimer.current != null) window.clearTimeout(copiedTimer.current);
    },
    [],
  );

  const handleCopy = async () => {
    const report = buildReport();
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      debugSessionLog('DIAG', 'DiagnosticsTab:export', 'copied', { len: report.length });
      if (copiedTimer.current != null) window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const handleClearLogs = () => {
    clearDebugSessionLog();
    setLogCount(0);
  };

  return (
    <div className={`${radii.lg} ${theme.card} ${elevation.card} p-5 space-y-4`}>
      <div className="flex items-center gap-3">
        <span className={`inline-flex items-center justify-center w-10 h-10 ${radii.md} ${theme.accentMuted}`}>
          <Bug className={`w-5 h-5 ${theme.accentText}`} />
        </span>
        <span className={textStyles.sectionLabel}>Диагностика</span>
      </div>
      <p className={`${textStyles.caption} ${theme.textMuted}`}>
        Журнал не содержит паролей, текста книг и цитат.
      </p>
      <ul className={`${radii.lg} ${theme.panel} px-4 py-3 ${textStyles.caption} ${theme.textMuted} space-y-1.5 font-mono text-[11px]`}>
        <li>APK: {appVersion} ({build})</li>
        <li>DB: v{LOCAL_DB_VERSION}</li>
        <li>Platform: {Capacitor.getPlatform()}</li>
        <li>Server: {connectionStatus}</li>
        <li>Log entries: {logCount}</li>
      </ul>
      <div className="flex gap-2">
        <Button variant="secondary" fullWidth onClick={handleCopy}>
          <Copy className="w-4 h-4 inline mr-1" aria-hidden />
          {copied ? 'Скопировано' : 'Экспорт журнала'}
        </Button>
        <Button variant="ghost" onClick={handleClearLogs} aria-label="Очистить локальные логи">
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
