import React from 'react';
import { Check, Loader2, UserPlus, X } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { elevation, motion, textStyles } from '../ui/tokens';
import DragSheet from '../ui/DragSheet';
import IconButton from '../ui/IconButton';
import { SheetDragHandle, sheetPanelClass, sheetPanelStyle } from '../ui/SheetChrome';
import { useOverlayBackHandler } from '../hooks/useBackHandler';
import { useDialog } from '../ui/Dialog';
import { useSnackbar } from '../ui/Snackbar';
import {
  accountKeyFor,
  forgetSavedAccount,
  listSavedAccounts,
  personalOwnerFor,
  switchToAccount,
  type SavedAccount,
} from '../lib/accounts';
import { serverHostLabel } from '../lib/serverUrl';
import type { ServerConfig } from '../types';

interface AccountSwitcherSheetProps {
  open: boolean;
  onClose: () => void;
  serverConfig: ServerConfig;
  /** «Добавить пользователя»: keeps the current account saved and opens the login form. */
  onAddAccount: () => void;
}

function useSavedAccounts(): SavedAccount[] {
  const [list, setList] = React.useState(listSavedAccounts);
  React.useEffect(() => {
    const onChange = () => setList(listSavedAccounts());
    window.addEventListener('inpx-accounts', onChange);
    return () => window.removeEventListener('inpx-accounts', onChange);
  }, []);
  return list;
}

/** Profile → «Сменить пользователя»: saved accounts of this device, one tap to switch. */
export default function AccountSwitcherSheet({ open, onClose, serverConfig, onAddAccount }: AccountSwitcherSheetProps) {
  const titleId = React.useId();
  const accounts = useSavedAccounts();
  const dialog = useDialog();
  const snackbar = useSnackbar();
  const [switchingKey, setSwitchingKey] = React.useState<string | null>(null);
  useOverlayBackHandler(open && !switchingKey, onClose);

  const currentKey = accountKeyFor(serverConfig);
  const currentOwner = personalOwnerFor(serverConfig);
  const isCurrent = (account: SavedAccount) =>
    account.key === currentKey
    || (account.username.trim().toLowerCase() === currentOwner && serverConfig.connectionStatus !== 'disconnected');

  const handleSwitch = async (account: SavedAccount) => {
    if (switchingKey || isCurrent(account)) return;
    setSwitchingKey(account.key);
    try {
      await switchToAccount(account, serverConfig);
      // The app reloads under the new account.
    } catch (error) {
      setSwitchingKey(null);
      snackbar.show(error instanceof Error ? error.message : 'Не удалось сменить пользователя', undefined, 'error');
    }
  };

  const handleForget = async (account: SavedAccount) => {
    const accepted = await dialog.confirm({
      title: `Убрать ${account.username}?`,
      message: 'Аккаунт пропадёт из списка на этом устройстве. Его позиции и закладки на сервере останутся.',
      confirmLabel: 'Убрать',
      cancelLabel: 'Отмена',
      destructive: true,
    });
    if (accepted) await forgetSavedAccount(account);
  };

  return (
    <DragSheet
      open={open}
      onClose={() => {
        if (!switchingKey) onClose();
      }}
      labelledBy={titleId}
      swallowOpeningPointer
      className={`${sheetPanelClass} px-5 pt-2 ${elevation.sheet}`}
    >
      <div style={sheetPanelStyle()}>
        <SheetDragHandle />
        <h2 id={titleId} className={`pt-2 pb-1 ${textStyles.sectionLabel} ${theme.text}`}>Пользователи</h2>
        <p className={`pb-3 ${textStyles.caption} ${theme.textMuted}`}>
          Скачанные книги общие, а позиции, закладки, заметки и полки у каждого свои
        </p>
        <ul className={`border-t ${theme.divider}`} aria-labelledby={titleId}>
          {accounts.map((account) => {
            const current = isCurrent(account);
            const busy = switchingKey === account.key;
            return (
              <li key={account.key} className={`flex items-center gap-2 border-b ${theme.divider}`}>
                <button
                  type="button"
                  disabled={current || Boolean(switchingKey)}
                  aria-current={current || undefined}
                  onClick={() => void handleSwitch(account)}
                  className={`flex-1 min-w-0 min-h-14 flex items-center gap-3 text-left ${theme.rowPress} ${theme.focusRing} ${motion.press}`}
                >
                  <span
                    className="w-10 h-10 shrink-0 rounded-full inline-flex items-center justify-center font-serif font-semibold bg-[var(--app-accent-soft)] text-[var(--app-accent)]"
                    aria-hidden
                  >
                    {account.username.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate ${textStyles.body} ${current ? `font-semibold ${theme.accentText}` : theme.text}`}>
                      {account.username}
                    </span>
                    <span className={`block truncate ${textStyles.caption} ${theme.textMuted}`}>
                      {current ? 'Сейчас' : serverHostLabel(account.url)}
                    </span>
                  </span>
                  {busy ? <Loader2 className={`w-5 h-5 shrink-0 animate-spin ${theme.textMuted}`} aria-label="Переключение" /> : null}
                  {current ? <Check className={`w-5 h-5 shrink-0 ${theme.accentText}`} aria-hidden /> : null}
                </button>
                {!current ? (
                  <IconButton
                    label={`Убрать ${account.username}`}
                    disabled={Boolean(switchingKey)}
                    onClick={() => void handleForget(account)}
                  >
                    <X className={`w-4 h-4 ${theme.textMuted}`} aria-hidden />
                  </IconButton>
                ) : null}
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          disabled={Boolean(switchingKey)}
          onClick={onAddAccount}
          className={`w-full min-h-14 my-2 flex items-center gap-3 text-left ${theme.rowPress} ${theme.focusRing} ${motion.press} disabled:opacity-50`}
        >
          <span className="w-10 h-10 shrink-0 rounded-full inline-flex items-center justify-center border border-dashed border-[color:var(--app-border)]" aria-hidden>
            <UserPlus className={`w-5 h-5 ${theme.textMuted}`} />
          </span>
          <span className={`${textStyles.body} ${theme.text}`}>Добавить пользователя</span>
        </button>
      </div>
    </DragSheet>
  );
}
