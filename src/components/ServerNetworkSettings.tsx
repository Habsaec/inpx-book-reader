import React from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  GripHorizontal,
  Home,
  Pencil,
  Plus,
  Server,
  Trash2,
  Wifi,
} from 'lucide-react';
import { theme } from '../lib/appTheme';
import { textStyles, semantic, radii, motion, touchMin, elevation } from '../ui/tokens';
import Button from '../ui/Button';
import type { ServerConfig } from '../types';
import { isAndroid } from '../lib/platform';
import { normalizeBaseUrl } from '../lib/inpxClient';
import { getNetworkStatus, requestSsidAccess, subscribeNetworkChanges, type NetworkStatus } from '../lib/networkInfo';
import { normalizeSsid } from '../lib/serverUrlSwitch';

interface ServerNetworkSettingsProps {
  serverConfig: ServerConfig;
  onChangeServerConfig: (config: Partial<ServerConfig>) => void;
}

type EditTarget = 'ssid' | 'localUrl' | 'new' | number | null;

export default function ServerNetworkSettings({
  serverConfig,
  onChangeServerConfig,
}: ServerNetworkSettingsProps) {
  const [liveNet, setLiveNet] = React.useState<NetworkStatus>({ transport: 'none', ssid: '' });
  const [editing, setEditing] = React.useState<EditTarget>(null);
  const [draft, setDraft] = React.useState('');
  const [useCurrentHint, setUseCurrentHint] = React.useState('');

  const currentUrl = normalizeBaseUrl(serverConfig.url) || serverConfig.url;
  const connected = serverConfig.connectionStatus === 'connected';
  const alternates = Array.isArray(serverConfig.alternateUrls) ? serverConfig.alternateUrls : [];
  const onHomeWifi = Boolean(
    normalizeSsid(serverConfig.localSsid) &&
      normalizeSsid(liveNet.ssid) &&
      normalizeSsid(serverConfig.localSsid) === normalizeSsid(liveNet.ssid),
  );

  React.useEffect(() => {
    if (!isAndroid()) return;
    let cancelled = false;
    void getNetworkStatus().then((status) => {
      if (!cancelled) setLiveNet(status);
    });
    const unsub = subscribeNetworkChanges((status) => setLiveNet(status));
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  if (!isAndroid()) return null;

  const startEdit = (target: Exclude<EditTarget, null>, value: string) => {
    setEditing(target);
    setDraft(value);
  };

  const commitEdit = () => {
    if (editing === 'ssid') {
      onChangeServerConfig({ localSsid: normalizeSsid(draft) });
    } else if (editing === 'localUrl') {
      onChangeServerConfig({ localUrl: normalizeBaseUrl(draft) || draft.trim() });
    } else if (editing === 'new') {
      const url = normalizeBaseUrl(draft);
      if (url && !alternates.includes(url) && url !== normalizeBaseUrl(serverConfig.localUrl || '')) {
        onChangeServerConfig({ alternateUrls: [...alternates, url] });
      }
    } else if (typeof editing === 'number') {
      const url = normalizeBaseUrl(draft) || draft.trim();
      const next = [...alternates];
      if (!url) next.splice(editing, 1);
      else next[editing] = url;
      onChangeServerConfig({ alternateUrls: next });
    }
    setEditing(null);
    setDraft('');
  };

  const handleUseCurrent = async () => {
    setUseCurrentHint('');
    const net = await requestSsidAccess();
    setLiveNet(net);
    const ssid = normalizeSsid(net.ssid);
    const patch: Partial<ServerConfig> = {};
    if (currentUrl) patch.localUrl = currentUrl;
    if (ssid) patch.localSsid = ssid;
    if (!currentUrl && !ssid) {
      setUseCurrentHint('Нет текущего адреса и имени Wi‑Fi. Подключитесь к серверу и домашней сети, затем повторите.');
      return;
    }
    onChangeServerConfig(patch);
    if (!ssid) {
      setUseCurrentHint('Адрес сохранён. Имя Wi‑Fi Android не отдал — нажмите карандаш и введите его (как в настройках телефона).');
      startEdit('ssid', serverConfig.localSsid || '');
    }
  };

  const moveAlternate = (index: number, dir: -1 | 1) => {
    const next = [...alternates];
    const swap = index + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[index], next[swap]] = [next[swap], next[index]];
    onChangeServerConfig({ alternateUrls: next });
  };

  const liveNetLabel =
    liveNet.transport === 'wifi'
      ? (liveNet.ssid ? `Wi‑Fi «${liveNet.ssid}»` : 'Wi‑Fi (имя неизвестно)')
      : liveNet.transport === 'cellular'
        ? 'мобильная сеть'
        : liveNet.transport === 'none'
          ? 'нет сети'
          : 'другая сеть';

  const inputClass = `w-full px-4 py-3.5 ${textStyles.body} ${radii.lg} ${theme.inputFocus} ${theme.input}`;

  return (
    <section className={`${radii.lg} ${theme.card} ${elevation.card} p-5 space-y-5`}>
      <div>
        <h3 className={textStyles.sectionLabel}>Сеть</h3>
        <p className={`${textStyles.caption} ${theme.textMuted} mt-1`}>Текущий адрес сервера</p>
        <div className={`mt-2 flex items-center gap-2 ${radii.lg} ${theme.panel} px-3 py-2.5`}>
          <Check className={`w-4 h-4 shrink-0 ${connected ? semantic.success : theme.textMuted}`} aria-hidden />
          <span className={`${textStyles.body} break-all`}>{currentUrl || '—'}</span>
        </div>
      </div>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={textStyles.bodyBold}>Автоматическая смена URL</p>
          <p className={`${textStyles.caption} ${theme.textMuted} mt-0.5`}>
            Подключаться локально по выбранной сети и использовать альтернативные адреса в ином случае
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(serverConfig.autoSwitch)}
          onClick={() => onChangeServerConfig({ autoSwitch: !serverConfig.autoSwitch })}
          className={`relative h-7 w-12 shrink-0 rounded-full ${theme.focusRing} ${
            serverConfig.autoSwitch ? theme.accentBg : theme.panel
          }`}
        >
          <span
            className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
              serverConfig.autoSwitch ? 'left-5' : 'left-0.5'
            }`}
          />
        </button>
      </div>

      {serverConfig.autoSwitch ? (
        <>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Home className={`w-4 h-4 ${theme.accentText}`} aria-hidden />
              <h4 className={textStyles.bodyBold}>Локальная сеть</h4>
            </div>
            <p className={`${textStyles.caption} ${theme.textMuted}`}>
              Приложение будет подключаться к серверу по этому адресу, когда устройство подключено к указанной Wi‑Fi сети.
            </p>
            <p className={`${textStyles.caption} ${theme.textMuted}`}>
              Сейчас: {liveNetLabel}
              {onHomeWifi ? ' — домашняя сеть' : ''}
            </p>

            <SettingsRow
              icon={Wifi}
              label="Имя сети"
              value={serverConfig.localSsid || 'Не задано'}
              onEdit={() => startEdit('ssid', serverConfig.localSsid || '')}
            />
            {editing === 'ssid' ? (
              <EditField
                id="edit-ssid"
                value={draft}
                placeholder="inWlan"
                inputMode="text"
                className={inputClass}
                onChange={setDraft}
                onCommit={commitEdit}
                onCancel={() => setEditing(null)}
              />
            ) : null}

            <SettingsRow
              icon={Server}
              label="Адрес сервера"
              value={serverConfig.localUrl || 'Не задан'}
              onEdit={() => startEdit('localUrl', serverConfig.localUrl || '')}
            />
            {editing === 'localUrl' ? (
              <EditField
                id="edit-local-url"
                value={draft}
                placeholder="http://192.168.1.10:3000"
                inputMode="url"
                className={inputClass}
                onChange={setDraft}
                onCommit={commitEdit}
                onCancel={() => setEditing(null)}
              />
            ) : null}

            {useCurrentHint ? (
              <p className={`${textStyles.caption} ${theme.textMuted}`}>{useCurrentHint}</p>
            ) : null}

            <Button variant="secondary" fullWidth onClick={() => void handleUseCurrent()}>
              <Wifi className="w-4 h-4" aria-hidden />
              Использовать текущее подключение
            </Button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Server className={`w-4 h-4 ${theme.accentText}`} aria-hidden />
              <h4 className={textStyles.bodyBold}>Внешняя сеть</h4>
            </div>
            <p className={`${textStyles.caption} ${theme.textMuted}`}>
              Когда устройство не подключено к указанной Wi‑Fi сети, приложение будет пытаться подключиться к серверу по адресам ниже, сверху вниз до успешного подключения.
            </p>

            <ul className="space-y-2">
              {alternates.map((url, index) => {
                const active = normalizeBaseUrl(url) === currentUrl;
                return (
                  <li key={`${url}-${index}`} className={`space-y-2`}>
                    <div className={`flex items-center gap-1 ${radii.lg} ${theme.panel} px-2 py-1.5`}>
                      <Check
                        className={`w-4 h-4 shrink-0 ${active && connected ? semantic.success : theme.textMuted}`}
                        aria-hidden
                      />
                      <button
                        type="button"
                        onClick={() => startEdit(index, url)}
                        className={`flex-1 min-w-0 text-left px-1 py-2 ${textStyles.caption} break-all ${theme.focusRing}`}
                      >
                        {url}
                      </button>
                      <span className={`${theme.textMuted} px-1`} aria-hidden>
                        <GripHorizontal className="w-4 h-4" />
                      </span>
                      <button
                        type="button"
                        aria-label="Выше"
                        disabled={index === 0}
                        onClick={() => moveAlternate(index, -1)}
                        className={`${touchMin} inline-flex items-center justify-center ${theme.focusRing} ${motion.press} disabled:opacity-30`}
                      >
                        <ChevronUp className="w-4 h-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label="Ниже"
                        disabled={index === alternates.length - 1}
                        onClick={() => moveAlternate(index, 1)}
                        className={`${touchMin} inline-flex items-center justify-center ${theme.focusRing} ${motion.press} disabled:opacity-30`}
                      >
                        <ChevronDown className="w-4 h-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label="Удалить адрес"
                        onClick={() => onChangeServerConfig({
                          alternateUrls: alternates.filter((_, i) => i !== index),
                        })}
                        className={`${touchMin} inline-flex items-center justify-center ${theme.focusRing} ${motion.press} ${semantic.error}`}
                      >
                        <Trash2 className="w-4 h-4" aria-hidden />
                      </button>
                    </div>
                    {editing === index ? (
                      <EditField
                        id={`edit-alt-${index}`}
                        value={draft}
                        placeholder="https://server.tailxxxxx.ts.net"
                        inputMode="url"
                        className={inputClass}
                        onChange={setDraft}
                        onCommit={commitEdit}
                        onCancel={() => setEditing(null)}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>

            {editing === 'new' ? (
              <EditField
                id="edit-new-alt"
                value={draft}
                placeholder="https://server.tailxxxxx.ts.net"
                inputMode="url"
                className={inputClass}
                onChange={setDraft}
                onCommit={commitEdit}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <Button variant="secondary" fullWidth onClick={() => startEdit('new', '')}>
                <Plus className="w-4 h-4" aria-hidden />
                Добавить адрес
              </Button>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}

function SettingsRow({
  icon: Icon,
  label,
  value,
  onEdit,
}: {
  icon: typeof Wifi;
  label: string;
  value: string;
  onEdit: () => void;
}) {
  return (
    <div className={`flex items-center gap-3 min-h-14 px-3 ${radii.lg} ${theme.panel}`}>
      <Icon className={`w-4 h-4 shrink-0 ${theme.accentText}`} aria-hidden />
      <div className="min-w-0 flex-1 py-2">
        <p className={`${textStyles.caption} ${theme.textMuted}`}>{label}</p>
        <p className={`${textStyles.body} break-all`}>{value}</p>
      </div>
      <button
        type="button"
        aria-label={`Изменить ${label}`}
        onClick={onEdit}
        className={`${touchMin} inline-flex items-center justify-center ${theme.focusRing} ${theme.textMuted}`}
      >
        <Pencil className="w-4 h-4" aria-hidden />
      </button>
    </div>
  );
}

function EditField({
  id,
  value,
  placeholder,
  inputMode,
  className,
  onChange,
  onCommit,
  onCancel,
}: {
  id: string;
  value: string;
  placeholder: string;
  inputMode: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  className: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-2">
      <input
        id={id}
        autoFocus
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onCommit();
          } else if (e.key === 'Escape') {
            onCancel();
          }
        }}
        className={className}
      />
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onCancel}>Отмена</Button>
        <Button className="flex-1" onClick={onCommit}>Сохранить</Button>
      </div>
    </div>
  );
}

export function canTestServerConnection(config: ServerConfig): boolean {
  if (normalizeBaseUrl(config.url)) return true;
  if (!config.autoSwitch) return false;
  return Boolean(normalizeBaseUrl(config.localUrl || '') || normalizeBaseUrl(config.alternateUrls?.[0] || ''));
}
