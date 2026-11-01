<script lang="ts" setup>
// Легенда подписей уровней (кнопка «Уровни»): цвета ступеней и высота полёта над землёй.
import { TaoFieldset } from '@1337exp/taoui';
import { AIR_ALTITUDE } from '@shared/core/grid';
import { useI18n } from '@shared/i18n';
import { ed } from '../state';
import { LEVEL_COLORS, levelColor } from '../levels';

const { t } = useI18n();
const steps = LEVEL_COLORS.map((_, k) => k);
</script>

<template>
    <TaoFieldset v-if="ed.levels" :legend="t('editor.levels.title')">
        <div class="chips">
            <span v-for="l in steps" :key="l" class="chip" :style="{ '--level': levelColor(l) }">{{ l }}</span>
        </div>
        <p class="ed-dim">{{ t('editor.levels.air', [AIR_ALTITUDE]) }}</p>
        <p v-if="ed.levelsTooMany" class="ed-dim">{{ t('editor.levels.tooMany') }}</p>
    </TaoFieldset>
</template>

<style scoped>
.chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 8px;
}

.chip {
    min-width: 24px;
    padding: 2px 6px;
    border: 1px solid var(--level);
    border-radius: 6px;
    color: var(--level);
    font-size: 12px;
    font-weight: 700;
    text-align: center;
}

.ed-dim {
    margin: 0 0 6px;
}
</style>
