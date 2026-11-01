<script lang="ts" setup>
// Полупрозрачная панель поверх сцены в углу экрана: поверхность и рамка из темы TaoUI, под ней лёгкое размытие сцены.
// Общая для HUD игры и панелей редактора.
withDefaults(defineProps<{ at?: 'top-left' | 'bottom-left' | 'bottom-right'; width?: string }>(), { at: 'top-left', width: '' });
</script>

<template>
    <section class="tao-panel" :class="at" :style="width ? { width: `min(${width}, calc(100vw - 32px))` } : undefined">
        <slot />
    </section>
</template>

<style scoped>
.tao-panel {
    position: fixed;
    padding: 10px 14px;
    border: 1px solid var(--tao-color-border);
    border-radius: 6px;
    background: color-mix(in srgb, var(--tao-color-surface) 82%, transparent);
    backdrop-filter: blur(4px);
    color: var(--tao-color-text);
    max-width: calc(100vw - 32px);
}

.top-left {
    top: 16px;
    left: 16px;
    max-height: calc(100vh - 32px);
    overflow: auto;
}

.bottom-left {
    left: 16px;
    bottom: 16px;
    font-size: 13px;
}

.bottom-right {
    right: 16px;
    bottom: 16px;
    color: var(--tao-color-text-muted);
    font-size: 12px;
}
</style>
