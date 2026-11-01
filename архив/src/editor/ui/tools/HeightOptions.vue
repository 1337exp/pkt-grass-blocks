<script lang="ts" setup>
// Настройки «Высоты»: режим «шаг / уровень»; в шаге выбор «уровень ±1 / сегмент ±½», в уровне кнопки 0–9 и «+½».
import { computed } from 'vue';
import { TaoButton, TaoFieldset, TaoFormField, TaoGrid, TaoSegmented, TaoSegmentedOption, TaoSwitch } from '@1337exp/taoui';
import { useI18n } from '@shared/i18n';
import { ed, type HeightMode, type HeightUnit } from '../../state';

const { t } = useI18n();

const mode = computed({
    get: () => ed.heightMode,
    set: (v: string) => (ed.heightMode = v as HeightMode),
});
/** Целые уровни 0–9 на кнопках; полуровня добавляет переключатель «+½». */
const levels = Array.from({ length: 10 }, (_, k) => k);

const unit = computed({
    get: () => String(ed.heightUnit),
    set: (v: string) => (ed.heightUnit = Number(v) as HeightUnit),
});
const half = computed({
    get: () => ed.level % 1 !== 0,
    set: (v: boolean) => (ed.level = Math.floor(ed.level) + (v ? 0.5 : 0)),
});

const modeHint = computed(() => t(ed.heightMode === 'level' ? 'editor.hint.level' : 'editor.hint.height'));
</script>

<template>
    <TaoFormField :label="t('editor.height.mode')" :hint="modeHint">
        <TaoSegmented v-model="mode" block>
            <TaoSegmentedOption value="step" :label="t('editor.height.step')" />
            <TaoSegmentedOption value="level" :label="t('editor.height.level')" />
        </TaoSegmented>
    </TaoFormField>

    <TaoFormField v-if="ed.heightMode === 'step'" :label="t('editor.height.stepSize')">
        <TaoSegmented v-model="unit" block>
            <TaoSegmentedOption value="1" :label="t('editor.height.whole')" />
            <TaoSegmentedOption value="0.5" :label="t('editor.height.segment')" />
        </TaoSegmented>
    </TaoFormField>

    <TaoFieldset v-else :legend="t('editor.height.target')">
        <TaoGrid :cols="5" :gap="6">
            <TaoButton
                v-for="l in levels"
                :key="l"
                block
                size="small"
                :variant="Math.floor(ed.level) === l ? 'primary' : 'secondary'"
                @click="ed.level = l + (half ? 0.5 : 0)"
            >
                {{ l }}
            </TaoButton>
        </TaoGrid>
        <TaoSwitch v-model="half" :label="t('editor.height.plusHalf')" />
    </TaoFieldset>
</template>
