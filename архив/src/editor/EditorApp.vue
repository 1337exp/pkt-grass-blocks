<script lang="ts" setup>
// Окно редактора на TaoUI: сверху панели файла и инструментов (ui/TopBar.vue), слева сведения (ui/InfoPanel.vue), справа
// настройки инструмента (ui/ToolPanel.vue), над миром — клетка под курсором (ui/TileOverlay.vue). Сцена — в середине (#app
// занимает место между колонками, см. page.css: body.editor), панели её не закрывают.
import './ui/editor.css';
import AskDialog from './ui/AskDialog.vue';
import InfoPanel from './ui/InfoPanel.vue';
import TileOverlay from './ui/TileOverlay.vue';
import ToolPanel from './ui/ToolPanel.vue';
import TopBar from './ui/TopBar.vue';
</script>

<template>
    <TopBar />
    <InfoPanel />
    <ToolPanel />
    <TileOverlay />
    <AskDialog />
</template>
