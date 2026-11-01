// Язык встроенных текстов TaoUI (подписи в выборе, окнах и т. п.) идёт за нашим языком интерфейса: сменили язык, и библиотека переключилась следом.

import { watchEffect } from 'vue';
import { localeEn, localeRu, setTaoLocale } from '@1337exp/taoui';
import { useI18n } from '@shared/i18n';

export function syncTaoLocale(): void {
    const { locale } = useI18n();
    watchEffect(() => setTaoLocale(locale.value === 'ru' ? localeRu : localeEn));
}
