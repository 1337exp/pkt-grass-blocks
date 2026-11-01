import { FALLBACK_LOCALE, isLocaleCode, type LocaleCode } from './locales';

/** Первый из языков браузера, который мы поддерживаем ('ru-RU' → 'ru'); иначе английский. */
export function detectLocale(languages: readonly string[]): LocaleCode {
    for (const tag of languages) {
        const base = tag.toLowerCase().split(/[-_]/)[0];
        if (isLocaleCode(base)) return base;
    }
    return FALLBACK_LOCALE;
}
