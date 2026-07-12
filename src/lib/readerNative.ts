import { registerPlugin } from '@capacitor/core';

export interface ReaderVoice {
  name: string;
  lang: string;
  uri: string;
}

export interface SafeAreaInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface ReaderNativePlugin {
  getSafeAreaInsets(): Promise<SafeAreaInsets>;
  setBrightness(options: { level: number }): Promise<void>;
  getBrightness(): Promise<{ level: number }>;
  getVoices(): Promise<{ voices: ReaderVoice[] }>;
  speak(options: { text: string; utteranceId?: string; rate?: number; voice?: string }): Promise<void>;
  stopTts(): Promise<void>;
  pauseTts(): Promise<void>;
  resumeTts(): Promise<void>;
  getTtsState(): Promise<{ speaking: boolean; paused: boolean }>;
  setSystemTextSelectionMenuEnabled(options: { enabled: boolean }): Promise<void>;
  setOrientationLock(options: { mode: 'auto' | 'portrait' | 'landscape' }): Promise<void>;
  addListener(
    event: 'ttsStart' | 'ttsEnd' | 'ttsError',
    handler: (data: { utteranceId: string }) => void,
  ): Promise<{ remove: () => void }>;
}

export const ReaderNative = registerPlugin<ReaderNativePlugin>('ReaderNative');

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
