import ru from './ru';
import en from './en';

export const LOCALES = { ru, en } as const;

export type LocaleCode = keyof typeof LOCALES;
export const LOCALE_CODES = Object.keys(LOCALES) as LocaleCode[];

/** Названия языков на самих языках: не переводятся, чтобы их можно было прочитать при любом выбранном языке. */
export const LOCALE_NAMES: Record<LocaleCode, string> = {
    ru: 'Русский',
    en: 'English',
};

export const FALLBACK_LOCALE: LocaleCode = 'en';

export function isLocaleCode(value: unknown): value is LocaleCode {
    return typeof value === 'string' && (LOCALE_CODES as readonly string[]).includes(value);
}
