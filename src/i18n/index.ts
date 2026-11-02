/**
 * Interface language of the app: Russian or English.
 *
 * `t('key', { name })` looks the key up in the active dictionary (`ru.ts` / `en.ts`) and fills
 * `{{name}}` placeholders; `tn('key', n)` picks a plural form (`key.one|few|many` in Russian,
 * `key.one|other` in English) and fills `{{n}}`. The language is chosen once at start-up from the
 * saved preference (Profile → Внешний вид → Язык) or the device language; changing it reloads
 * the app, so module-level constants built with `t()` are always in the active language.
 */
import { ru, type MessageKey } from './ru';
import { en } from './en';

export type { MessageKey } from './ru';
export type UiLocale = 'ru' | 'en';
export type UiLanguagePref = 'auto' | UiLocale;

/** localStorage (shared with the reader WebView, same origin). */
export const UI_LANGUAGE_STORAGE_KEY = 'inpx-ui-language';

const DICTIONARIES: Record<UiLocale, Record<string, string>> = { ru, en };
/** Languages that get the Russian interface in «Авто». */
const RUSSIAN_UI_LANGS = new Set(['ru', 'uk', 'be', 'kk']);

export function detectDeviceLocale(languages?: readonly string[]): UiLocale {
  let list = languages;
  if (!list) {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    list = nav?.languages?.length ? nav.languages : nav?.language ? [nav.language] : [];
  }
  const first = String(list[0] || '').toLowerCase().split(/[-_]/)[0];
  return RUSSIAN_UI_LANGS.has(first) ? 'ru' : 'en';
}

export function getUiLanguagePref(): UiLanguagePref {
  try {
    const raw = globalThis.localStorage?.getItem(UI_LANGUAGE_STORAGE_KEY);
    return raw === 'ru' || raw === 'en' ? raw : 'auto';
  } catch {
    return 'auto';
  }
}

/** Saves the preference; the caller reloads the app to apply it. */
export function setUiLanguagePref(pref: UiLanguagePref): void {
  try {
    if (pref === 'auto') globalThis.localStorage?.removeItem(UI_LANGUAGE_STORAGE_KEY);
    else globalThis.localStorage?.setItem(UI_LANGUAGE_STORAGE_KEY, pref);
  } catch {
    /* private mode / storage blocked: stays «Авто» */
  }
}

export function localeForPref(pref: UiLanguagePref): UiLocale {
  return pref === 'auto' ? detectDeviceLocale() : pref;
}

let activeLocale: UiLocale = localeForPref(getUiLanguagePref());

export function getLocale(): UiLocale {
  return activeLocale;
}

/** Tests run in Russian (the strings they assert on). */
export function setLocaleForTests(locale: UiLocale): void {
  activeLocale = locale;
}

/** BCP 47 tag for `Intl` / `toLocaleString`. */
export function intlLocale(): string {
  return activeLocale === 'en' ? 'en-US' : 'ru-RU';
}

function lookup(key: string): string {
  const dict = DICTIONARIES[activeLocale];
  if (Object.prototype.hasOwnProperty.call(dict, key)) return dict[key];
  if (Object.prototype.hasOwnProperty.call(ru, key)) return (ru as Record<string, string>)[key];
  return key;
}

function fill(str: string, params?: Record<string, unknown>): string {
  if (!params) return str;
  let out = str;
  for (const [k, v] of Object.entries(params)) out = out.split(`{{${k}}}`).join(String(v ?? ''));
  return out;
}

export function t(key: MessageKey, params?: Record<string, unknown>): string {
  return fill(lookup(key), params);
}

export function pluralForm(n: number, locale: UiLocale = activeLocale): 'one' | 'few' | 'many' | 'other' {
  const v = Math.floor(Math.abs(Number(n) || 0));
  if (locale === 'en') return v === 1 ? 'one' : 'other';
  const m10 = v % 10;
  const m100 = v % 100;
  if (m10 === 1 && m100 !== 11) return 'one';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'few';
  return 'many';
}

/** Plural phrase: `tn('common.booksCount', 5)` → «5 книг» / «5 books». `{{n}}` is the number as given. */
export function tn(key: string, n: number, params?: Record<string, unknown>): string {
  return fill(lookup(`${key}.${pluralForm(n)}`), { n, ...params });
}

/** Number with the active locale's grouping («1 234» / «1,234»). */
export function formatNumber(n: number): string {
  return Number(n || 0).toLocaleString(intlLocale());
}
