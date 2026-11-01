// Переводы интерфейса (перенесено из ритм-игры base-v3): словари в locales/ (ru — источник ключей, en повторяет его, проверяет
// компилятор), язык — сохранённый выбор, иначе язык браузера, иначе английский. В шаблонах — `useI18n().t` (перерисуются при
// смене языка), в коде — `t` (переводит на текущий язык в момент вызова). Ядро (shared/core) сюда не смотрит: оно работает и на
// сервере, его сообщения (проверка файла карты) пока по-русски.

import { computed, ref } from 'vue';
import { FALLBACK_LOCALE, isLocaleCode, LOCALES, type LocaleCode } from './locales';
import type ru from './locales/ru';

type Paths<T, P extends string = ''> = {
    [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Paths<T[K], `${P}${K}.`>;
}[keyof T & string];

/** Все допустимые ключи словаря: 'hud.depth', 'end.dead', ... */
export type MessageKey = Paths<typeof ru>;
export type MessageArgs = readonly (string | number)[];

const STORAGE_KEY = 'pkt.map.locale';

const current = ref<LocaleCode>(FALLBACK_LOCALE);

/** Применить язык интерфейса: все `t()` в шаблонах перерисуются, `<html lang>` обновится. */
export function applyLocale(code: LocaleCode): void {
    current.value = code;
    if (typeof document !== 'undefined') document.documentElement.lang = code;
}

/** Применить язык и запомнить выбор пользователя. */
export function setLocale(code: LocaleCode): void {
    applyLocale(code);
    try {
        localStorage.setItem(STORAGE_KEY, code);
    } catch {
        // приватный режим или запрет хранилища: язык просто не запомнится
    }
}

/** Язык при старте: сохранённый выбор, иначе русский. Переключатель в панели по-прежнему пишет выбор. */
export function initLocale(): LocaleCode {
    let saved: string | null = null;
    try {
        saved = localStorage.getItem(STORAGE_KEY);
    } catch {
        // см. setLocale
    }

    const code = isLocaleCode(saved) ? saved : 'ru';
    applyLocale(code);
    return code;
}

function lookup(dict: unknown, path: string): string | undefined {
    let cur: unknown = dict;
    for (const part of path.split('.')) {
        if (cur === null || typeof cur !== 'object') return undefined;
        cur = (cur as Record<string, unknown>)[part];
    }
    return typeof cur === 'string' ? cur : undefined;
}

/** Перевод без реактивности: нужен там, где язык известен явно (и в тестах). */
export function translate(code: LocaleCode, key: MessageKey, args: MessageArgs = []): string {
    // запасной вариант: английский, затем сам ключ (чтобы пропуск было видно)
    const template = lookup(LOCALES[code], key) ?? lookup(LOCALES[FALLBACK_LOCALE], key) ?? key;
    return template.replace(/\{(\d+)\}/g, (match, index: string) => {
        const value = args[Number(index)];
        return value === undefined ? match : String(value);
    });
}

/** Перевод на текущий язык в момент вызова (для кода вне шаблонов: сообщения, подсказки). */
export function t(key: MessageKey, args?: MessageArgs): string {
    return translate(current.value, key, args);
}

export function useI18n() {
    return {
        locale: computed(() => current.value),
        // читает current.value внутри, поэтому шаблон перерисуется при смене языка
        t: (key: MessageKey, args?: MessageArgs) => translate(current.value, key, args),
    };
}
