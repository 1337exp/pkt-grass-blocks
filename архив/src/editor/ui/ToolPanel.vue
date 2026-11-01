<script lang="ts" setup>
// Правая колонка: настройки выбранного инструмента (выбор — в верхней панели, клавиши 1–3).
import { TaoAlert, TaoBlock, TaoSpace } from '@1337exp/taoui';
import { useI18n } from '@shared/i18n';
import { ed } from '../state';
import BrushOptions from './tools/BrushOptions.vue';
import LevelLegend from './LevelLegend.vue';
import HeightOptions from './tools/HeightOptions.vue';
import TerrainOptions from './tools/TerrainOptions.vue';

const { t } = useI18n();
</script>

<template>
    <aside class="ed-bar ed-side right ed-tool">
        <TaoSpace direction="column" :gap="14" expand block>
            <TaoBlock :padding="12" :shadow="false" surface="flat">
                <TaoSpace direction="column" :gap="14" expand block>
                    <p class="tao-heading-6 ed-tool-title">{{ t(`editor.tool.${ed.tool}`) }}</p>
                    <HeightOptions v-if="ed.tool === 'height'" />
                    <TerrainOptions v-else-if="ed.tool === 'terrain'" />
                    <TaoAlert v-else tone="info" :title="t('editor.tool.slope')">
                        {{ t('editor.hint.slope') }}
                    </TaoAlert>
                </TaoSpace>
            </TaoBlock>
            <BrushOptions v-if="ed.tool === 'height' || ed.tool === 'terrain'" />
            <LevelLegend />
        </TaoSpace>
    </aside>
</template>

<style scoped>
.right {
    right: 0;
    width: var(--ed-right);
    border-left: 1px solid var(--tao-color-border);
}

.ed-tool {
    gap: 0;
    padding-top: 10px;
}

.ed-tool-title {
    margin: 0;
}
</style>
