<script lang="ts" setup>
// Левая колонка: размер карты, сообщение и клавиши. Клетка под курсором — над миром (TileOverlay.vue).
import { computed } from 'vue';
import { TaoDivider } from '@1337exp/taoui';
import { type MessageKey, useI18n } from '@shared/i18n';
import KeyHelp from '@shared/ui/KeyHelp.vue';
import { ed, type Tool } from '../state';

const { t } = useI18n();

/** Клавиши инструмента: [клавиши словарём или как есть, что делают]. */
type Keys = [(MessageKey | string)[], MessageKey][];
const TOOL_KEYS: Record<Tool, Keys> = {
    height: [
        [['key.lmb'], 'editor.keys.raise'],
        [['Shift', 'key.lmb'], 'editor.keys.lower'],
        [['Alt', 'key.lmb'], 'editor.keys.pickLevel'],
    ],
    terrain: [
        [['key.lmb'], 'editor.keys.paint'],
        [['Alt', 'key.lmb'], 'editor.keys.pickTerrain'],
    ],
    slope: [
        [['key.lmb'], 'editor.keys.slope'],
        [['key.rmb'], 'editor.keys.flat'],
    ],
};
const label = (k: string): string => (k.includes('.') ? t(k as MessageKey) : k);
const rows = (keys: Keys): [string[], string][] => keys.map(([ks, what]) => [ks.map(label), t(what)]);
const help = computed(() => [
    rows([[['1', '2', '3'], 'editor.keys.tool'], ...TOOL_KEYS[ed.tool], ...(ed.tool === 'height' || ed.tool === 'terrain' ? ([[['[', ']'], 'editor.keys.brush']] as Keys) : [])]),
    rows([
        [['Ctrl', 'Z'], 'editor.keys.undo'],
        [['Ctrl', 'Y'], 'editor.keys.redo'],
        [['Ctrl', 'S'], 'editor.keys.save'],
    ]),
    rows([
        [['Q', 'E'], 'editor.keys.rotate'],
        [['T'], 'editor.keys.topView'],
        [['key.wheel'], 'editor.keys.zoom'],
        [['WASD'], 'editor.keys.pan'],
    ]),
]);
</script>

<template>
    <aside class="ed-bar ed-side left">
        <TaoDivider :text="t('editor.info.map')" />
        <dl class="ed-facts">
            <dt>{{ t('editor.info.size') }}</dt>
            <dd>{{ ed.size || '—' }}</dd>
        </dl>
        <p v-if="ed.status" class="status" :class="{ error: ed.error }">{{ ed.status }}</p>

        <span class="ed-grow" />
        <TaoDivider :text="t('editor.info.keys')" />
        <KeyHelp :rows="help" inline />
    </aside>
</template>

<style scoped>
.left {
    left: 0;
    width: var(--ed-left);
    border-right: 1px solid var(--tao-color-border);
}

.status {
    margin: 0;
    font-size: 12px;
    color: var(--tao-color-text-muted);
}

.status.error {
    color: var(--tao-color-danger);
}
</style>
