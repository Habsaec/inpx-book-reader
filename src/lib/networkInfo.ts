import { registerPlugin } from '@capacitor/core';
import { isNativeApp } from './platform';

export type NetworkTransport = 'wifi' | 'cellular' | 'other' | 'none';

export interface NetworkStatus {
  transport: NetworkTransport;
  ssid: string;
}

interface NetworkInfoPlugin {
  getStatus(): Promise<NetworkStatus>;
  requestSsidAccess(): Promise<NetworkStatus>;
  addListener(
    eventName: 'networkChange',
    listener: (status: NetworkStatus) => void,
  ): Promise<{ remove: () => void }>;
}

const NetworkInfo = registerPlugin<NetworkInfoPlugin>('NetworkInfo');

export async function getNetworkStatus(): Promise<NetworkStatus> {
  if (!isNativeApp()) return { transport: 'other', ssid: '' };
  try {
    const status = await NetworkInfo.getStatus();
    return {
      transport: status.transport || 'none',
      ssid: String(status.ssid || '').trim(),
    };
  } catch {
    return { transport: 'none', ssid: '' };
  }
}

export async function requestSsidAccess(): Promise<NetworkStatus> {
  if (!isNativeApp()) return getNetworkStatus();
  try {
    const status = await NetworkInfo.requestSsidAccess();
    return {
      transport: status.transport || 'none',
      ssid: String(status.ssid || '').trim(),
    };
  } catch {
    return getNetworkStatus();
  }
}

export function subscribeNetworkChanges(listener: (status: NetworkStatus) => void): () => void {
  if (!isNativeApp()) return () => {};
  let removed = false;
  let handle: { remove: () => void } | null = null;
  void NetworkInfo.addListener('networkChange', listener).then((h) => {
    if (removed) {
      h.remove();
      return;
    }
    handle = h;
  }).catch(() => {});
  return () => {
    removed = true;
    handle?.remove();
  };
}
