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
import { impactLight } from '../lib/haptics';
import { theme } from '../lib/appTheme';
import { textStyles, semantic, radii, motion, touchMin } from '../ui/tokens';
import Button from '../ui/Button';
import type { ServerConfig } from '../types';
import { isAndroid } from '../lib/platform';
import { normalizeBaseUrl } from '../lib/inpxClient';
import { getNetworkStatus, requestSsidAccess, subscribeNetworkChanges, type NetworkStatus } from '../lib/networkInfo';
import { normalizeSsid } from '../lib/serverUrlSwitch';
import { t } from '../i18n';

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
      setUseCurrentHint(t('serverNetworkSettings.noCurrentAddressOrWi'));
      return;
    }
    onChangeServerConfig(patch);
    if (!ssid) {
      setUseCurrentHint(t('serverNetworkSettings.theAddressIsSavedAndroid'));
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
      ? (liveNet.ssid ? `Wi‑Fi «${liveNet.ssid}»` : t('serverNetworkSettings.wiFiNameUnknown'))
      : liveNet.transport === 'cellular'
        ? t('serverNetworkSettings.mobileNetwork')
        : liveNet.transport === 'none'
          ? t('serverNetworkSettings.noNetwork')
          : t('serverNetworkSettings.anotherNetwork');

  const inputClass = `w-full px-4 py-3.5 ${textStyles.body} ${radii.lg} ${theme.inputFocus} ${theme.input}`;

  return (
    <section className="space-y-5">
      <div>
        <h3 className={`${textStyles.sectionLabel} ${theme.text}`}>{t('serverNetworkSettings.network')}</h3>
        <p className={`${textStyles.caption} ${theme.textMuted} mt-1`}>{t('serverNetworkSettings.currentServerAddress')}</p>
        <div className="mt-2 flex items-center gap-2 min-h-12">
          <Check className={`w-4 h-4 shrink-0 ${connected ? semantic.success : theme.textMuted}`} aria-hidden />
          <span className={`${textStyles.body} break-all`}>{currentUrl || '—'}</span>
        </div>
      </div>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={textStyles.bodyBold}>{t('serverNetworkSettings.automaticUrlSwitching')}</p>
          <p className={`${textStyles.caption} ${theme.textMuted} mt-0.5`}>
            {t('serverNetworkSettings.connectLocallyOnTheChosen')}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(serverConfig.autoSwitch)}
          onClick={() => {
            impactLight();
            onChangeServerConfig({ autoSwitch: !serverConfig.autoSwitch });
          }}
          className={`inpx-switch relative h-7 w-12 shrink-0 rounded-full ${theme.focusRing} ${
            serverConfig.autoSwitch ? theme.accentBg : theme.panel
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 ease-out ${
              serverConfig.autoSwitch ? 'translate-x-[1.125rem]' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {serverConfig.autoSwitch ? (
        <>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Home className={`w-4 h-4 ${theme.accentText}`} aria-hidden />
              <h4 className={textStyles.bodyBold}>{t('serverNetworkSettings.localNetwork')}</h4>
            </div>
            <p className={`${textStyles.caption} ${theme.textMuted}`}>
              {t('serverNetworkSettings.theAppConnectsToThe')}
            </p>
            <p className={`${textStyles.caption} ${theme.textMuted}`}>
              {t('serverNetworkSettings.now')} {liveNetLabel}
              {onHomeWifi ? t('serverNetworkSettings.homeNetwork') : ''}
            </p>

            <SettingsRow
              icon={Wifi}
              label={t('serverNetworkSettings.networkName')}
              value={serverConfig.localSsid || t('serverNetworkSettings.notSet')}
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
              label={t('common.serverAddress')}
              value={serverConfig.localUrl || t('serverNetworkSettings.notSetAddress')}
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
              {t('serverNetworkSettings.useTheCurrentConnection')}
            </Button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Server className={`w-4 h-4 ${theme.accentText}`} aria-hidden />
              <h4 className={textStyles.bodyBold}>{t('serverNetworkSettings.externalNetwork')}</h4>
            </div>
            <p className={`${textStyles.caption} ${theme.textMuted}`}>
              {t('serverNetworkSettings.whenTheDeviceIsNot')}
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
                        aria-label={t('serverNetworkSettings.up')}
                        disabled={index === 0}
                        onClick={() => moveAlternate(index, -1)}
                        className={`${touchMin} inline-flex items-center justify-center ${theme.focusRing} ${motion.press} disabled:opacity-30`}
                      >
                        <ChevronUp className="w-4 h-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label={t('serverNetworkSettings.down')}
                        disabled={index === alternates.length - 1}
                        onClick={() => moveAlternate(index, 1)}
                        className={`${touchMin} inline-flex items-center justify-center ${theme.focusRing} ${motion.press} disabled:opacity-30`}
                      >
                        <ChevronDown className="w-4 h-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label={t('serverNetworkSettings.deleteTheAddress')}
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
                {t('serverNetworkSettings.addAnAddress')}
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
    <div className={`flex items-center gap-3 min-h-14 py-1 border-b ${theme.divider}`}>
      <Icon className={`w-4 h-4 shrink-0 ${theme.accentText}`} aria-hidden />
      <div className="min-w-0 flex-1 py-2">
        <p className={`${textStyles.caption} ${theme.textMuted}`}>{label}</p>
        <p className={`${textStyles.body} break-all`}>{value}</p>
      </div>
      <button
        type="button"
        aria-label={t('serverNetworkSettings.edit', { label })}
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
        <Button variant="secondary" className="flex-1" onClick={onCancel}>{t('common.cancel')}</Button>
        <Button className="flex-1" onClick={onCommit}>{t('common.save')}</Button>
      </div>
    </div>
  );
}

export function canTestServerConnection(config: ServerConfig): boolean {
  if (normalizeBaseUrl(config.url)) return true;
  if (!config.autoSwitch) return false;
  return Boolean(normalizeBaseUrl(config.localUrl || '') || normalizeBaseUrl(config.alternateUrls?.[0] || ''));
}
