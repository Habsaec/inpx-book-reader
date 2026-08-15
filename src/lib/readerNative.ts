import { registerPlugin } from '@capacitor/core';

export interface ReaderVoice {
  name: string;
  lang: string;
  uri: string;
}

export interface ReaderVoicesResult {
  voices: ReaderVoice[];
  /** Package системного TTS-движка (из настроек телефона). */
  engine?: string;
}

export interface SafeAreaInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface NativeDeviceInfo {
  manufacturer: string;
  brand: string;
  model: string;
  onyxDevice?: boolean;
  onyxFrontLight?: boolean;
  onyxWarmth?: boolean;
  onyxEpdRefresh?: boolean;
  onyxStatus?: string;
  onyxError?: string;
  writeSettings?: boolean;
}

export interface FrontLightState {
  brightness: number;
  warmth: number;
  brightnessIndex?: number;
  warmthIndex?: number;
  brightnessSteps?: number;
  warmthSteps?: number;
  warmthSupported?: boolean;
  mode?: string;
  status?: string;
  level?: number;
  onyx?: boolean;
  onyxError?: string;
}

interface ReaderNativePlugin {
  getSafeAreaInsets(): Promise<SafeAreaInsets>;
  getDeviceInfo(): Promise<NativeDeviceInfo>;
  setBrightness(options: { level: number }): Promise<FrontLightState | void>;
  getBrightness(): Promise<FrontLightState>;
  getFrontLightState(): Promise<FrontLightState>;
  adjustFrontLight(options: { brightnessDelta?: number; warmthDelta?: number }): Promise<FrontLightState>;
  setFrontLightRaw(options: { brightnessRaw?: number; warmthRaw?: number }): Promise<FrontLightState>;
  setWarmth(options: { level: number }): Promise<FrontLightState | void>;
  setLightSwipe(options: { enabled: boolean }): Promise<{ active: boolean; supported: boolean }>;
  setVolumeKeysCapture(options: { enabled: boolean }): Promise<{ enabled: boolean }>;
  refreshEinkScreen(): Promise<{ ok: boolean; supported: boolean; error?: string }>;
  getWarmth(): Promise<FrontLightState & { supported?: boolean }>;
  getVoices(): Promise<ReaderVoicesResult>;
  speak(options: { text: string; utteranceId?: string; rate?: number; voice?: string }): Promise<void>;
  stopTts(): Promise<void>;
  pauseTts(): Promise<void>;
  resumeTts(): Promise<void>;
  getTtsState(): Promise<{ speaking: boolean; paused: boolean }>;
  updateTtsMediaSession(options: {
    title?: string;
    artist?: string;
    coverUrl?: string;
    coverBase64?: string;
    authHeader?: string;
    playing: boolean;
    active: boolean;
  }): Promise<void>;
  setSystemTextSelectionMenuEnabled(options: { enabled: boolean }): Promise<void>;
  setOrientationLock(options: { mode: 'auto' | 'portrait' | 'landscape' }): Promise<void>;
  addListener(
    event: 'ttsStart' | 'ttsEnd' | 'ttsError',
    handler: (data: { utteranceId: string }) => void,
  ): Promise<{ remove: () => void }>;
  addListener(
    event: 'ttsMediaAction',
    handler: (data: { action: 'play' | 'pause' | 'stop' | 'prev' | 'next' }) => void,
  ): Promise<{ remove: () => void }>;
}

export const ReaderNative = registerPlugin<ReaderNativePlugin>('ReaderNative');

/** Methods the Foliate iframe may invoke via postMessage. Parent-only APIs stay off this list. */
export const READER_NATIVE_BRIDGE_METHODS = [
  'setBrightness',
  'getBrightness',
  'getFrontLightState',
  'adjustFrontLight',
  'setFrontLightRaw',
  'setWarmth',
  'setLightSwipe',
  'refreshEinkScreen',
  'getWarmth',
  'getVoices',
  'speak',
  'stopTts',
  'pauseTts',
  'resumeTts',
  'getTtsState',
  'updateTtsMediaSession',
] as const satisfies ReadonlyArray<keyof ReaderNativePlugin>;

const BRIDGE_METHOD_SET = new Set<string>(READER_NATIVE_BRIDGE_METHODS);

export function isReaderNativeBridgeMethod(method: unknown): method is typeof READER_NATIVE_BRIDGE_METHODS[number] {
  return typeof method === 'string' && BRIDGE_METHOD_SET.has(method);
}

export async function callReaderNative(
  method: keyof ReaderNativePlugin,
  data?: Record<string, unknown>,
): Promise<unknown> {
  const plugin = ReaderNative as unknown as Record<string, (opts?: Record<string, unknown>) => Promise<unknown>>;
  const fn = plugin[method as string];
  if (typeof fn !== 'function') {
    throw new Error(`ReaderNative.${String(method)} unavailable`);
  }
  return fn(data);
}
