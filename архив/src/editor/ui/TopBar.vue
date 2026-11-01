<script lang="ts" setup>
// Верхняя полоса: две панели TaoUI. Меню сюда не ставим — выпадающий список закрывает второй ряд.
import { computed } from 'vue';
import {
    TaoButton,
    TaoInput,
    TaoSegmented,
    TaoSegmentedOption,
    TaoSelect,
    TaoSwitch,
    TaoTag,
    TaoToolbar,
    TaoToolbarGroup,
    TaoToolbarSeparator,
    type TaoSelectOption,
} from '@1337exp/taoui';
import { formatHotkey, parseHotkey } from '@1337exp/taoux/hotkeys';
import { isLocaleCode, LOCALE_CODES, LOCALE_NAMES, setLocale, useI18n } from '@shared/i18n';
import { ed, editorActions, TOOL_ORDER, type Tool } from '../state';

const { t, locale } = useI18n();

const shortcut = (combo: string): string => formatHotkey(parseHotkey(combo));
const saveKey = shortcut('Mod+S');
const undoKey = shortcut('Mod+Z');
const redoKey = shortcut('Mod+Y');

const mapOptions = computed<TaoSelectOption[]>(() => ed.maps.map((m) => ({ value: m, label: m })));
const view = computed({
    get: () => (ed.topView ? 'top' : 'iso'),
    set: (v: string) => (ed.topView = v === 'top'),
});
const lang = computed({
    get: () => locale.value,
    set: (v: string) => isLocaleCode(v) && setLocale(v),
});

function pickTool(id: Tool): void {
    ed.tool = id;
}
</script>

<template>
    <header class="ed-bar top tao-surface-grain">
        <TaoToolbar class="ed-chrome" :label="t('editor.top.fileBar')" variant="plain">
            <TaoSelect class="map" :model-value="ed.id" :clearable="false" :options="mapOptions" :disabled="ed.busy" :aria-label="t('editor.top.map')" @update:model-value="editorActions.open(String($event))" />
            <TaoInput class="name" v-model="ed.name" :placeholder="t('editor.top.name')" :aria-label="t('editor.top.name')" />
            <TaoButton icon="tao-plus" variant="secondary" :disabled="ed.busy" @click="editorActions.create()">{{ t('editor.top.newMap') }}</TaoButton>
            <TaoButton icon="tao-check" :variant="ed.dirty ? 'primary' : 'secondary'" :disabled="ed.busy || !ed.id" :loading="ed.busy" :shortcut="saveKey" @click="editorActions.save()">{{ t('editor.top.save') }}</TaoButton>
            <TaoToolbarSeparator />
            <TaoToolbarGroup :label="t('editor.top.history')" inset>
                <TaoButton icon="tao-undo" variant="ghost" :disabled="!ed.canUndo" :aria-label="t('editor.top.undo')" :title="undoKey" @click="editorActions.undo()" />
                <TaoButton icon="tao-redo" variant="ghost" :disabled="!ed.canRedo" :aria-label="t('editor.top.redo')" :title="redoKey" @click="editorActions.redo()" />
            </TaoToolbarGroup>
            <span class="ed-grow" />
            <TaoTag v-if="ed.dirty" tone="warning">{{ t('editor.top.unsaved') }}</TaoTag>
        </TaoToolbar>
        <TaoToolbar class="ed-chrome" :label="t('editor.top.toolsBar')" variant="plain">
            <TaoSegmented v-model="view" title="T">
                <TaoSegmentedOption value="iso" :label="t('editor.top.iso')" />
                <TaoSegmentedOption value="top" :label="t('editor.top.topView')" />
            </TaoSegmented>
            <TaoSwitch v-model="ed.levels" :label="t('editor.top.levels')" title="L" />
            <TaoToolbarSeparator />
            <TaoToolbarGroup :label="t('editor.top.tools')" inset>
                <TaoButton v-for="(id, k) in TOOL_ORDER" :key="id" variant="ghost" :pressed="ed.tool === id" :shortcut="String(k + 1)" @click="pickTool(id)">{{ t(`editor.tool.${id}`) }}</TaoButton>
            </TaoToolbarGroup>
            <span class="ed-grow" />
            <TaoSegmented v-model="lang" :aria-label="t('lang.title')">
                <TaoSegmentedOption v-for="c in LOCALE_CODES" :key="c" :value="c" :label="LOCALE_NAMES[c]" />
            </TaoSegmented>
        </TaoToolbar>
    </header>
</template>

<style scoped>
.top {
    top: 0;
    left: 0;
    right: 0;
    height: var(--ed-top);
    flex-direction: column;
    justify-content: center;
    gap: var(--tao-space-2);
    padding: var(--tao-space-2) 14px;
    border-bottom: 1px solid var(--tao-color-border);
}

.ed-chrome {
    width: 100%;
    min-width: 0;
    gap: var(--tao-space-3);
}

.map {
    width: 148px;
}

.name {
    width: 188px;
}
</style>
