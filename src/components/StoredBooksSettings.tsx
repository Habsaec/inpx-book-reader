import React from 'react';
import { App as CapApp } from '@capacitor/app';
import { theme } from '../lib/appTheme';
import { textStyles } from '../ui/tokens';
import Button from '../ui/Button';
import { useDialog } from '../ui/Dialog';
import { useSnackbar } from '../ui/Snackbar';
import { isAndroid } from '../lib/platform';
import type { StorageDirectory } from '../lib/storageDirectory';
import {
  STORED_BOOKS_RESCAN_EVENT,
  cleanupStoredDuplicates,
  hasStoredFilesAccess,
  isDownloadsLibraryFolder,
  requestStoredFilesAccess,
} from '../lib/storedBooks';
import { t, formatNumber } from '../i18n';

function Row({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 min-h-14 py-2">
      <div className="min-w-0">
        <p className={`${textStyles.body} ${theme.text}`}>{label}</p>
        <p className={`${textStyles.caption} ${theme.textMuted} mt-0.5`}>{hint}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function megabytes(bytes: number): string {
  return formatNumber(Math.max(0.1, Math.round((bytes / (1024 * 1024)) * 10) / 10));
}

/**
 * Profile → Хранилище, under the library folders: access to old files after a reinstall (Android 11+,
 * folder in Download/), «Найти скачанные книги» and removing the «name (N)» copies left behind.
 */
export default function StoredBooksSettings({ storageDirectory }: { storageDirectory: StorageDirectory | null }) {
  const dialog = useDialog();
  const snackbar = useSnackbar();
  const [access, setAccess] = React.useState(true);
  const [dupes, setDupes] = React.useState<{ count: number; bytes: number } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const needsAccess = isDownloadsLibraryFolder(storageDirectory) && !access;

  const refresh = React.useCallback(async () => {
    const granted = await hasStoredFilesAccess();
    setAccess(granted);
    // Copies can only be seen (and removed) with access to the folder's files.
    if (!granted && isDownloadsLibraryFolder(storageDirectory)) {
      setDupes(null);
      return;
    }
    const res = await cleanupStoredDuplicates(storageDirectory, false);
    setDupes(res.count > 0 ? { count: res.count, bytes: res.bytes } : null);
  }, [storageDirectory]);

  React.useEffect(() => {
    if (!isAndroid()) return;
    void refresh();
    // Back from the system «All files access» screen.
    const sub = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void refresh();
    });
    return () => {
      void sub.then((h) => h.remove()).catch(() => {});
    };
  }, [refresh]);

  if (!isAndroid() || !storageDirectory?.uri) return null;

  return (
    <div className="border-t border-[color:var(--app-border)] pt-2">
      {needsAccess ? (
        <Row label={t('storedBooks.accessTitle')} hint={t('storedBooks.accessHint')}>
          <Button
            variant="secondary"
            onClick={() => {
              void requestStoredFilesAccess().then(async (ok) => {
                await refresh();
                if (ok) window.dispatchEvent(new Event(STORED_BOOKS_RESCAN_EVENT));
              });
            }}
          >
            {t('storedBooks.allow')}
          </Button>
        </Row>
      ) : null}
      <Row label={t('storedBooks.findTitle')} hint={t('storedBooks.findHint')}>
        <Button variant="secondary" onClick={() => window.dispatchEvent(new Event(STORED_BOOKS_RESCAN_EVENT))}>
          {t('storedBooks.find')}
        </Button>
      </Row>
      {dupes ? (
        <Row
          label={t('storedBooks.dupesTitle')}
          hint={t('storedBooks.dupesHint', { n: formatNumber(dupes.count), mb: megabytes(dupes.bytes) })}
        >
          <Button
            variant="secondary"
            loading={busy}
            disabled={busy}
            onClick={() => {
              void (async () => {
                const ok = await dialog.confirm({
                  title: t('storedBooks.dupesConfirmTitle'),
                  message: t('storedBooks.dupesConfirmMessage', { n: formatNumber(dupes.count), mb: megabytes(dupes.bytes) }),
                  confirmLabel: t('storedBooks.dupesDelete'),
                  cancelLabel: t('storedBooks.notNow'),
                  destructive: true,
                });
                if (!ok) return;
                setBusy(true);
                const res = await cleanupStoredDuplicates(storageDirectory, true);
                setBusy(false);
                snackbar.show(t('storedBooks.dupesDeleted', { n: formatNumber(res.deleted) }));
                await refresh();
              })();
            }}
          >
            {t('storedBooks.dupesDelete')}
          </Button>
        </Row>
      ) : null}
    </div>
  );
}
