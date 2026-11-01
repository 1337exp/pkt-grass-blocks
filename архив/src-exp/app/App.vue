<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { TaoButton, TaoInput, TaoMenubar, TaoSegmented, TaoSegmentedOption, TaoSlider, TaoSplit, TaoToolbar, type TaoMenuItem } from '@1337exp/taoui';
import { downloadText, readTextFile } from '@1337exp/taoux/file';
import { formatHotkey, parseHotkey, bindHotkeys } from '@1337exp/taoux/hotkeys';
import { History } from '@1337exp/taoux/history';
import { eraseBlock, fillBlock, formatWorld, islandWorld, paintSpan, parseWorld, putProp, removePropAt, setCorners, setName, setSky, shiftTop, type World, WorldError } from '@core/index';
import { rampCorners, type Dir } from '@core/slope';
import { bounds } from '@core/world';
import { Stage, type WorldHit } from '@three/stage';

type Tool = 'face' | 'height' | 'material' | 'slope' | 'prop';

const MATERIALS = ['grass', 'dirt', 'rock', 'sand', 'wood', 'water', 'wall'] as const;
const TOOLS: { id: Tool; label: string; key: string }[] = [
    { id: 'face', label: 'Грань', key: '1' },
    { id: 'height', label: 'Высота', key: '2' },
    { id: 'material', label: 'Материал', key: '3' },
    { id: 'slope', label: 'Склон', key: '4' },
    { id: 'prop', label: 'Проп', key: '5' },
];

const world = shallowRef<World>(islandWorld());
const tool = ref<Tool>('face');
const material = ref<(typeof MATERIALS)[number]>('grass');
const propType = ref<'tree' | 'crate'>('tree');
const hour = ref(world.value.sky.hour);
const cycle = ref(false);
const split = ref(78);
const name = ref(world.value.name);
const status = ref('Острова');
const canUndo = ref(false);
const canRedo = ref(false);
const host = ref<HTMLElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

const history = new History(formatWorld(world.value));
let stage: Stage | null = null;
let stopKeys = () => {};
let painting = false;
let panning = false;
let orbiting = false;
let moved = false;
let lastX = 0;
let lastY = 0;
const touched = new Set<string>();

const shortcut = (combo: string): string => formatHotkey(parseHotkey(combo));

const menus = computed<TaoMenuItem[]>(() => [
    {
        id: 'file',
        label: 'Файл',
        items: [
            { id: 'sample', label: 'Образец' },
            { id: 'blank', label: 'Новая' },
            { id: 'open', label: 'Открыть', shortcut: shortcut('Mod+O') },
            { id: 'save', label: 'Скачать', shortcut: shortcut('Mod+S') },
        ],
    },
    {
        id: 'edit',
        label: 'Правка',
        items: [
            { id: 'undo', label: 'Отменить', shortcut: shortcut('Mod+Z'), disabled: !canUndo.value },
            { id: 'redo', label: 'Повторить', shortcut: shortcut('Mod+Shift+Z'), disabled: !canRedo.value },
        ],
    },
    {
        id: 'view',
        label: 'Вид',
        items: [
            { id: 'iso', label: 'Изометрия' },
            { id: 'top', label: 'Сверху', shortcut: 'T' },
        ],
    },
]);

const readStatus = (hit: WorldHit | null): string => {
    if (!hit) return world.value.name;
    if (hit.ground) return `плоскость ${hit.face.x}, ${hit.face.z}`;
    return `${hit.face.x}, ${hit.face.y}, ${hit.face.z} · ${hit.face.material || 'воздух'}`;
};

function syncHistory(): void {
    canUndo.value = history.canUndo;
    canRedo.value = history.canRedo;
}

function show(next: World, frame = false): void {
    world.value = next;
    name.value = next.name;
    hour.value = next.sky.hour;
    cycle.value = next.sky.cycleHours > 0;
    stage?.setWorld(next, frame);
    stage?.setCycle(next.sky.cycleHours);
}

function snapshot(): string {
    const live = stage?.hour ?? hour.value;
    return formatWorld(setSky(world.value, { hour: live, cycleHours: cycle.value ? 1 / 60 : 0 }));
}

function commit(key?: string): void {
    history.commit(snapshot(), key);
    syncHistory();
}

function loadText(text: string, frame: boolean): void {
    const next = parseWorld(JSON.parse(text));
    show(next, frame);
    status.value = next.name;
}

function undo(): void {
    const text = history.undo();
    if (text) loadText(text, false);
    syncHistory();
}

function redo(): void {
    const text = history.redo();
    if (text) loadText(text, false);
    syncHistory();
}

function replace(next: World): void {
    if (next === world.value) return;
    world.value = next;
    stage?.setWorld(next, false);
}

function nearMap(x: number, z: number): boolean {
    const box = bounds(world.value);
    if (!box) return Math.abs(x) <= 16 && Math.abs(z) <= 16;
    return x >= box.x0 - 8 && x <= box.x1 + 8 && z >= box.z0 - 8 && z <= box.z1 + 8;
}

function applyHit(hit: WorldHit, secondary: boolean): void {
    const { face } = hit;
    if (hit.ground) {
        if (secondary || !nearMap(face.x, face.z)) return;
        const key = `${face.x},0,${face.z}`;
        if (touched.has(key)) return;
        touched.add(key);
        if (tool.value === 'height' || tool.value === 'face') replace(fillBlock(world.value, face.x, face.z, 0, material.value));
        return;
    }
    const key = `${face.x},${face.y},${face.z},${secondary ? 's' : 'p'}`;
    if (touched.has(key)) return;
    touched.add(key);
    const column = `${face.x},${face.z}`;
    if (tool.value === 'face') {
        if (secondary) replace(eraseBlock(world.value, face.x, face.z, face.y));
        else replace(fillBlock(world.value, face.x + face.nx, face.z + face.nz, face.y + face.ny, material.value));
        return;
    }
    if (tool.value === 'height') {
        if (touched.has(column)) return;
        touched.add(column);
        replace(shiftTop(world.value, face.x, face.z, secondary ? -1 : 1, material.value));
        return;
    }
    if (tool.value === 'material') {
        if (secondary || face.spanY0 < 0) return;
        replace(paintSpan(world.value, face.x, face.z, face.spanY0, material.value));
        return;
    }
    if (tool.value === 'slope') {
        if (touched.has(column)) return;
        touched.add(column);
        if (secondary || face.kind !== 'top' && face.kind !== 'ramp') {
            replace(setCorners(world.value, face.x, face.z, face.spanY0, null));
            return;
        }
        const localX = hit.point.x / world.value.block - face.x - 0.5;
        const localZ = hit.point.z / world.value.block - face.z - 0.5;
        const dir: Dir = Math.abs(localX) > Math.abs(localZ)
            ? { dx: localX >= 0 ? 1 : -1, dz: 0 }
            : { dx: 0, dz: localZ >= 0 ? 1 : -1 };
        const corners = rampCorners(dir);
        const spans = world.value.columns.get(`${face.x},${face.z}`);
        const span = spans?.find((s) => s.y0 === face.spanY0);
        const same = span?.corners?.every((v, i) => v === corners[i]);
        replace(setCorners(world.value, face.x, face.z, face.spanY0, same ? null : corners));
        return;
    }
    if (tool.value === 'prop') {
        const y = face.kind === 'top' || face.kind === 'ramp' ? face.y + 1 : face.y;
        if (secondary) replace(removePropAt(world.value, face.x, face.z, y));
        else replace(putProp(world.value, { id: `prop-${face.x}-${face.z}-${y}`, type: propType.value, x: face.x, z: face.z, y, yaw: 0 }));
    }
}

function onWheel(ev: WheelEvent): void {
    stage?.zoomBy(ev.deltaY);
}

function onPointerDown(ev: PointerEvent): void {
    if (!stage) return;
    lastX = ev.clientX;
    lastY = ev.clientY;
    moved = false;
    touched.clear();
    orbiting = ev.button === 1 || (ev.button === 0 && ev.altKey);
    panning = ev.button === 2;
    painting = ev.button === 0 && !ev.altKey;
    if (painting) {
        const hit = stage.pick(ev.clientX, ev.clientY);
        status.value = readStatus(hit);
        if (hit) applyHit(hit, false);
    }
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
}

function onPointerMove(ev: PointerEvent): void {
    if (!stage) return;
    const dx = ev.clientX - lastX;
    const dy = ev.clientY - lastY;
    if (Math.hypot(dx, dy) > 3) moved = true;
    lastX = ev.clientX;
    lastY = ev.clientY;
    if (orbiting) stage.orbit(dx, dy);
    else if (panning && moved) stage.pan(dx, dy);
    else if (painting && moved) {
        const hit = stage.pick(ev.clientX, ev.clientY);
        status.value = readStatus(hit);
        if (hit) applyHit(hit, false);
    } else if (!painting && !panning && !orbiting) {
        status.value = readStatus(stage.pick(ev.clientX, ev.clientY));
    }
}

function onPointerUp(ev: PointerEvent): void {
    if (!stage) return;
    if (ev.button === 2 && !moved) {
        const hit = stage.pick(ev.clientX, ev.clientY);
        if (hit) applyHit(hit, true);
    }
    painting = false;
    panning = false;
    orbiting = false;
    commit(tool.value);
}

function onMenu(id: string): void {
    if (id === 'undo') undo();
    else if (id === 'redo') redo();
    else if (id === 'save') downloadText(`${world.value.name}.json`, snapshot());
    else if (id === 'open') fileInput.value?.click();
    else if (id === 'sample') openFresh(islandWorld());
    else if (id === 'blank') openFresh(blank());
    else if (id === 'top') stage?.setTop(true);
    else if (id === 'iso') stage?.setTop(false);
}

function blank(): World {
    const next = islandWorld();
    return { ...next, name: 'Карта', columns: new Map(), props: [], sky: { hour: 12, cycleHours: 0 } };
}

function openFresh(next: World): void {
    show(next, true);
    history.reset(formatWorld(next));
    syncHistory();
    status.value = next.name;
}

async function onFile(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const read = await readTextFile(file);
    if (!read.ok) {
        status.value = 'файл не прочитан';
        return;
    }
    try {
        const next = parseWorld(JSON.parse(read.text));
        openFresh(next);
    } catch (e) {
        status.value = e instanceof WorldError ? e.message : 'файл карты не разобран';
    }
}

function onName(value: string): void {
    name.value = value;
    const next = setName(world.value, value);
    if (next === world.value) return;
    world.value = next;
    commit('name');
}

function onHour(value: number): void {
    hour.value = value;
    stage?.setHour(value);
    world.value = setSky(world.value, { hour: value, cycleHours: world.value.sky.cycleHours });
}

function toggleCycle(): void {
    cycle.value = !cycle.value;
    if (!cycle.value) hour.value = stage?.hour ?? hour.value;
    const next = setSky(world.value, { hour: hour.value, cycleHours: cycle.value ? 1 / 60 : 0 });
    world.value = next;
    stage?.setHour(hour.value);
    stage?.setCycle(next.sky.cycleHours);
    commit('sky');
}

let observer: ResizeObserver | null = null;

onMounted(() => {
    if (!host.value) return;
    stage = new Stage(host.value);
    stage.setWorld(world.value, true);
    stage.start();
    observer = new ResizeObserver(() => stage?.resize());
    observer.observe(host.value);
    stopKeys = bindHotkeys(window, {
        'Mod+Z': () => undo(),
        'Mod+Shift+Z': () => redo(),
        'Mod+Y': () => redo(),
        'Mod+S': () => downloadText(`${world.value.name}.json`, snapshot()),
        'Mod+O': () => fileInput.value?.click(),
        '1': () => { tool.value = 'face'; },
        '2': () => { tool.value = 'height'; },
        '3': () => { tool.value = 'material'; },
        '4': () => { tool.value = 'slope'; },
        '5': () => { tool.value = 'prop'; },
        q: () => stage?.rotate(-1),
        e: () => stage?.rotate(1),
        t: () => {
            if (stage) stage.setTop(!stage.topView);
        },
    });
});

onBeforeUnmount(() => {
    observer?.disconnect();
    stopKeys();
    stage?.dispose();
});
</script>

<template>
    <div class="app" @contextmenu.prevent>
        <TaoMenubar :items="menus" aria-label="Карта" @select="onMenu" />
        <TaoToolbar label="Инструменты" variant="plain">
            <TaoButton
                v-for="item in TOOLS"
                :key="item.id"
                variant="ghost"
                :pressed="tool === item.id"
                :shortcut="item.key"
                @click="tool = item.id"
            >
                {{ item.label }}
            </TaoButton>
        </TaoToolbar>
        <TaoSplit v-model="split" class="work" :min="62" :max="88">
            <template #start>
                <div
                    ref="host"
                    class="stage"
                    @pointerdown="onPointerDown"
                    @pointermove="onPointerMove"
                    @pointerup="onPointerUp"
                    @wheel.prevent="onWheel"
                />
            </template>
            <template #end>
                <aside class="side">
                    <TaoInput :model-value="name" aria-label="Имя карты" @update:model-value="onName(String($event))" />
                    <p class="hint">{{ status }}</p>
                    <TaoSegmented v-model="material" legend="Материал" block>
                        <TaoSegmentedOption v-for="id in MATERIALS" :key="id" :value="id" :label="id" />
                    </TaoSegmented>
                    <TaoSegmented v-if="tool === 'prop'" v-model="propType" legend="Проп">
                        <TaoSegmentedOption value="tree" label="дерево" />
                        <TaoSegmentedOption value="crate" label="ящик" />
                    </TaoSegmented>
                    <label class="field">
                        Час суток
                        <TaoSlider
                            :model-value="hour"
                            :min="0"
                            :max="24"
                            :step="0.1"
                            show-value
                            :marks="[
                                { value: 6, label: 'утро' },
                                { value: 12, label: 'день' },
                                { value: 18, label: 'вечер' },
                                { value: 22, label: 'ночь' },
                            ]"
                            @update:model-value="onHour($event)"
                            @change="commit('sky')"
                        />
                    </label>
                    <TaoButton variant="secondary" :pressed="cycle" @click="toggleCycle">Сутки идут</TaoButton>
                    <p class="hint">ЛКМ ставит, ПКМ снимает. ПКМ с движением — сдвиг, Alt+ЛКМ — обзор, колесо — масштаб, Q и E — поворот.</p>
                </aside>
            </template>
        </TaoSplit>
        <input ref="fileInput" class="file" type="file" accept="application/json,.json" @change="onFile" />
    </div>
</template>

<style scoped>
.app {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
}

.work {
    flex: 1;
    min-height: 0;
}

.stage {
    height: 100%;
    touch-action: none;
}

.side {
    height: 100%;
    box-sizing: border-box;
    overflow: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    color: var(--tao-color-text-muted);
    font-size: 12px;
}

.hint {
    margin: 0;
    color: var(--tao-color-text-muted);
    font-size: 13px;
    line-height: 1.4;
}

.file {
    display: none;
}
</style>
