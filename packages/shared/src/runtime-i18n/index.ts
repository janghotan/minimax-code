import {
  EN_RUNTIME_TRANSLATIONS,
  type RuntimeTranslationKey,
  type RuntimeTranslations,
} from './en.js';
import { ZH_HANS_RUNTIME_TRANSLATIONS } from './zh-Hans.js';

let globalRuntimeLanguageOverride: 'zh' | 'en' | null = null;

function resolveDefaultLanguage(): 'zh' | 'en' {
  const env = process.env.MINIMAX_LANGUAGE ?? process.env.MCODE_LANGUAGE;
  if (env) {
    const clean = env.trim().toLowerCase();
    if (clean.startsWith('en')) return 'en';
    if (clean.startsWith('zh')) return 'zh';
  }
  if (process.env.NODE_ENV === 'test' && !process.env.MINIMAX_FORCE_ZH) {
    return 'en';
  }
  return 'zh';
}

/** Get current active global UI language ('zh' | 'en'). Defaults to 'zh'. */
export function getGlobalRuntimeLanguage(): 'zh' | 'en' {
  return globalRuntimeLanguageOverride ?? resolveDefaultLanguage();
}

/** Switch global UI language ('zh' | 'en') dynamically at runtime. */
export function setGlobalRuntimeLanguage(lang: 'zh' | 'en'): void {
  globalRuntimeLanguageOverride = lang;
  process.env.MINIMAX_LANGUAGE = lang;
  process.env.MCODE_LANGUAGE = lang;
}

/** Reset global UI language override. */
export function resetGlobalRuntimeLanguage(): void {
  globalRuntimeLanguageOverride = null;
}

type RuntimeLocale = 'en' | 'zh-Hans';

const DEFAULT_RUNTIME_LOCALE: RuntimeLocale = 'zh-Hans';

const RUNTIME_TRANSLATIONS: Readonly<Record<RuntimeLocale, RuntimeTranslations>> = {
  en: EN_RUNTIME_TRANSLATIONS,
  'zh-Hans': ZH_HANS_RUNTIME_TRANSLATIONS,
};

/** Extract the canonical language subtag from a BCP 47 locale or active global language. */
export function getRuntimeLocaleLanguage(locale?: string | null): string {
  if (globalRuntimeLanguageOverride) {
    return globalRuntimeLanguageOverride;
  }
  if (!locale) {
    return getGlobalRuntimeLanguage();
  }

  const candidate = locale.trim().replace(/_/gu, '-');
  try {
    return new Intl.Locale(candidate).language.toLowerCase();
  } catch {
    return candidate.split('-')[0]?.toLowerCase() || getGlobalRuntimeLanguage();
  }
}

function resolveRuntimeLocale(locale?: string | null): RuntimeLocale {
  return getRuntimeLocaleLanguage(locale) === 'zh' ? 'zh-Hans' : 'en';
}

export function translateRuntimeText(
  locale: string | null | undefined,
  key: RuntimeTranslationKey,
): string {
  return RUNTIME_TRANSLATIONS[resolveRuntimeLocale(locale)][key];
}

export type { RuntimeTranslationKey } from './en.js';
