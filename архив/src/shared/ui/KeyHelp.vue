<script lang="ts" setup>
// Подсказка управления: строки из пар «клавиши — что делают». По умолчанию — панель в правом нижнем углу (на узком экране
// прячется); `inline` — список «клавиши — действие» столбиком, его ставят в колонку (редактор).
import Panel from './Panel.vue';

defineProps<{ rows: [keys: string[], what: string][][]; inline?: boolean }>();
</script>

<template>
    <div v-if="inline" class="inline">
        <div v-for="(row, r) in rows" :key="r" class="group">
            <div v-for="([keys, what], i) in row" :key="i" class="line">
                <span class="keys"><kbd v-for="(k, j) in keys" :key="j">{{ k }}</kbd></span>
                <span>{{ what }}</span>
            </div>
        </div>
    </div>
    <Panel v-else at="bottom-right" class="key-help">
        <div v-for="(row, r) in rows" :key="r">
            <template v-for="([keys, what], i) in row" :key="i">
                <template v-if="i > 0"> · </template>
                <template v-for="(k, j) in keys" :key="j"><kbd>{{ k }}</kbd>{{ j < keys.length - 1 ? ' ' : '' }}</template>
                {{ what }}
            </template>
        </div>
    </Panel>
</template>

<style scoped>
kbd {
    padding: 0 5px;
    border: 1px solid var(--tao-color-border);
    border-radius: 4px;
    color: var(--tao-color-text);
    font: 600 11px system-ui, sans-serif;
}

.key-help {
    /* не шире половины экрана: слева внизу панель клетки, подсказка переносится, а не наезжает на неё */
    max-width: min(560px, calc(50vw - 24px));
}

.inline {
    display: grid;
    gap: 10px;
    color: var(--tao-color-text-muted);
    font-size: 12px;
}

.group {
    display: grid;
    gap: 4px;
}

.line {
    display: grid;
    grid-template-columns: 92px 1fr;
    gap: 8px;
    align-items: baseline;
}

.keys {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
}

@media (max-width: 720px) {
    .key-help {
        display: none;
    }
}
</style>
