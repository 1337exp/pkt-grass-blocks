<script lang="ts" setup>
// Окно вопроса редактора: подтверждение или ввод строки (dialog.ts).
import { TaoButton, TaoInput, TaoModal } from '@1337exp/taoui';
import { useI18n } from '@shared/i18n';
import { answer, dlg } from '../dialog';

const { t } = useI18n();
</script>

<template>
    <TaoModal :model-value="dlg.open" @update:model-value="!$event && answer(null)">
        <p class="ask">{{ dlg.text }}</p>
        <TaoInput v-if="dlg.input" v-model="dlg.value" @keydown.enter="answer(dlg.value)" />
        <div class="btns">
            <TaoButton variant="secondary" @click="answer(null)">{{ t('editor.dialog.cancel') }}</TaoButton>
            <TaoButton variant="primary" @click="answer(dlg.value)">{{ t('editor.dialog.ok') }}</TaoButton>
        </div>
    </TaoModal>
</template>

<style scoped>
.ask {
    margin: 0 0 12px;
}

.btns {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 14px;
}
</style>
