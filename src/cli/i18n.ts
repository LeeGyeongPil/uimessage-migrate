import { en } from './messages.en.js';
import { ko } from './messages.ko.js';

export type Lang = 'en' | 'ko';
export type MessageKey = keyof typeof en;

export const MESSAGES: Record<Lang, Record<MessageKey, string>> = { en, ko };

export const LANG_ENV = 'UIMESSAGE_MIGRATE_LANG';

export function isLang(value: string): value is Lang {
  return value === 'en' || value === 'ko';
}

/**
 * Pick the display language. Order: --lang flag, UIMESSAGE_MIGRATE_LANG, LC_ALL, LC_MESSAGES, LANG.
 * The first non-empty value wins; a value starting with "ko" means Korean, anything else English.
 */
export function resolveLang(flag: string | undefined, env: NodeJS.ProcessEnv): Lang {
  if (flag !== undefined && isLang(flag)) return flag;
  for (const name of [LANG_ENV, 'LC_ALL', 'LC_MESSAGES', 'LANG']) {
    const value = env[name];
    if (value) return value.toLowerCase().startsWith('ko') ? 'ko' : 'en';
  }
  return 'en';
}

export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** Build a translate function for one language. `{name}` placeholders are replaced from `vars`. */
export function createT(lang: Lang): Translate {
  const table = MESSAGES[lang];
  return (key, vars = {}) =>
    table[key].replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}
