<script lang="ts" setup>
// Кисть «Высоты» и «Местности»: размер 1×1 / 3×3 и что она задевает (всё / сушу / воду).
import { computed } from 'vue';
import { TaoFieldset, TaoFormField, TaoSegmented, TaoSegmentedOption } from '@1337exp/taoui';
import { useI18n } from '@shared/i18n';
import { type Affect, ed } from '../../state';

const { t } = useI18n();

const brush = computed({
    get: () => String(ed.brush),
    set: (v: string) => (ed.brush = v === '3' ? 3 : 1),
});
const affect = computed({
    get: () => ed.affect,
    set: (v: string) => (ed.affect = v as Affect),
});
</script>

<template>
    <TaoFieldset :legend="t('editor.brush.title')">
        <TaoFormField :label="t('editor.brush.size')" :hint="t('editor.brush.keys')">
            <TaoSegmented v-model="brush" block title="[ ]">
                <TaoSegmentedOption value="1" label="1×1" />
                <TaoSegmentedOption value="3" label="3×3" />
            </TaoSegmented>
        </TaoFormField>
        <TaoFormField :label="t('editor.brush.affect')" :hint="t('editor.hint.affect')">
            <TaoSegmented v-model="affect" block>
                <TaoSegmentedOption value="all" :label="t('editor.brush.all')" />
                <TaoSegmentedOption value="land" :label="t('editor.brush.land')" />
                <TaoSegmentedOption value="water" :label="t('editor.brush.water')" />
            </TaoSegmented>
        </TaoFormField>
    </TaoFieldset>
</template>
