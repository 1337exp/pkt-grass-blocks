// Свои окна вопроса вместо window.confirm / prompt: во встроенных браузерах нативные окна молча возвращают «нет», и кнопки
// казались мёртвыми. Окно рисует ui/AskDialog.vue.

import { reactive } from 'vue';

export const dlg = reactive({
    open: false,
    text: '',
    /** Есть поле ввода (вопрос с ответом-строкой). */
    input: false,
    value: '',
});

let done: ((v: string | null) => void) | null = null;

function show(text: string, input: boolean): Promise<string | null> {
    done?.(null);
    Object.assign(dlg, { open: true, text, input, value: '' });
    return new Promise((resolve) => (done = resolve));
}

/** Закрыть окно: `null` — отказ. */
export function answer(v: string | null): void {
    dlg.open = false;
    done?.(v);
    done = null;
}

export const confirmAsk = async (text: string): Promise<boolean> => (await show(text, false)) !== null;
export const promptAsk = (text: string): Promise<string | null> => show(text, true);
