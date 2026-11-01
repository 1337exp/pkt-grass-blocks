<script lang="ts" setup>
// Клетка под курсором — над миром, в левом верхнем углу сцены (рядом с левой колонкой): нужна перед глазами, а в колонке её
// строки прыгали бы от каждого движения мыши. Текст с тенью, без подложки: не закрывает карту.
import { useI18n } from '@shared/i18n';
import { ed } from '../state';

const { t } = useI18n();
</script>

<template>
    <div v-if="ed.tile" class="tile">
        <b>{{ t('editor.tile.place', [ed.tile.x, ed.tile.z]) }}</b>
        <span>{{ t('editor.tile.height', [ed.tile.h]) }}</span>
        <span>{{ t(`terrain.${ed.tile.terrain}`) }}</span>
        <span v-if="ed.tile.slope">{{ t('editor.tile.slope', [ed.tile.slope]) }}</span>
    </div>
</template>

<style scoped>
.tile {
    position: fixed;
    top: calc(var(--ed-top) + 10px);
    left: calc(var(--ed-left) + 14px);
    display: flex;
    gap: 12px;
    color: var(--tao-color-text);
    font-size: 13px;
    /* тёмная обводка вокруг букв: читается на любой клетке */
    text-shadow:
        0 0 3px #000,
        0 0 3px #000,
        0 1px 2px #000;
    pointer-events: none;
    white-space: nowrap;
}

.tile span {
    color: color-mix(in srgb, var(--tao-color-text) 78%, transparent);
}
</style>
