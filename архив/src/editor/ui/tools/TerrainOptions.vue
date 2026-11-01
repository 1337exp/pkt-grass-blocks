<script lang="ts" setup>
// Настройки «Местности»: палитра всех типов (короткие имена, полное — в подсказке при наведении).
import { TaoButton, TaoFormField, TaoGrid } from '@1337exp/taoui';
import type { Terrain } from '@shared/core/grid';
import { TERRAIN } from '@shared/core/grid';
import { useI18n } from '@shared/i18n';
import { ed } from '../../state';

const { t } = useI18n();

/** Все типы местности по порядку правил. */
const palette = Object.keys(TERRAIN) as Terrain[];
</script>

<template>
    <TaoFormField :label="t('editor.palette')" :hint="t('editor.hint.terrain')">
        <TaoGrid :cols="3" :gap="6">
            <TaoButton
                v-for="p in palette"
                :key="p"
                block
                size="small"
                :variant="ed.paint === p ? 'primary' : 'secondary'"
                :title="t(`terrain.${p}`)"
                @click="ed.paint = p"
            >
                {{ t(`terrainShort.${p}`) }}
            </TaoButton>
        </TaoGrid>
    </TaoFormField>
</template>
