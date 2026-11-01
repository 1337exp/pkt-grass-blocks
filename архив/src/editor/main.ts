// Редактор карты: рельеф, местность и склоны. Фигуры игры (мехи, деревья) сюда не входят.
//
//   session.ts  открытый документ, клетка под курсором, сообщения
//   doc.ts      карта, поле, снимки и история правок
//   tools/      инструменты 1–3: высота, местность, склон
//   file.ts     открыть и сохранить
//   ui/         окно на TaoUI
//
// Клавиши: Q / E поворот, WASD или протяжка ПКМ сдвиг, колесо масштаб, T вид сверху, 1–3 инструмент, [ ] кисть,
// Ctrl+S сохранить, Ctrl+Z / Ctrl+Y отменить / повторить.

import { createApp, watch } from 'vue';
import '@1337exp/taoui/styles.css';
import '@shared/view/page.css';
import { isSloped } from '@shared/core/grid';
import { initLocale } from '@shared/i18n';
import { syncTaoLocale } from '@shared/ui/taoLocale';
import { Stage } from '@shared/view/stage';
import EditorApp from './EditorApp.vue';
import { newMap, openMap, saveMap, startFiles } from './file';
import { session } from './session';
import { ed, editorActions } from './state';
import { LevelLabels } from './levels';
import { makeTools, TOOL_ORDER } from './tools';

initLocale();
syncTaoLocale();
// все контролы редактора мелкие: размер берут от корня страницы (TaoUI 2: `size` наследуется), и в окнах поверх страницы тоже
document.body.classList.add('tao-size-small', 'tao-density-compact');
const stage = new Stage(document.getElementById('app')!);
createApp(EditorApp).mount('#ui');

const levelLabels = new LevelLabels();
session.levels = () => levelLabels.update(session.doc);
const tools = makeTools(stage);
const tool = () => tools[ed.tool];

/** Курсор, серебряная рама инструмента (след кисти или выделенная сущность) и подсказка клетки над миром. */
session.refresh = () => {
    const doc = session.doc;
    if (!doc) return;
    const i = session.hover;
    doc.board.setHover(i);
    doc.board.setMarks(
        tool()
            .area(i)
            .map((j) => ({ i: j, mark: 'brush' as const, dist: 0 })),
        'brush',
    );
    const c = i !== null ? doc.map.cells[i] : undefined;
    ed.tile = c ? { x: c.x, z: c.z, h: c.h, terrain: c.terrain, slope: isSloped(c) ? c.corners!.join('') : '' } : null;
};

const undo = (redo = false): void => {
    if (!tool().busy?.()) session.doc?.undo(redo);
};

editorActions.open = (id) => void openMap(stage, id);
editorActions.create = () => void newMap(stage);
editorActions.save = () => void saveMap();
editorActions.undo = () => undo();
editorActions.redo = () => undo(true);

watch(
    () => ed.topView,
    (on) => stage.setTopView(on),
);
// другой инструмент: прежний убирает своё с поля, рама и курсор — по новому
watch(
    () => ed.tool,
    (_now, was) => {
        tools[was].deactivate?.();
        session.refresh();
    },
);
watch(() => [ed.brush, ed.affect], session.refresh);
watch(() => ed.levels, () => session.levels());
// имя карты правится в панели: это тоже правка
watch(
    () => ed.name,
    (name) => {
        const doc = session.doc;
        if (doc && name !== doc.loaded.name) {
            doc.loaded.name = name;
            doc.updateDirty();
        }
    },
);

//---]> ввод: всё — текущему инструменту

/** Клетка под курсором: для инструментов и подсказки клетки. */
function track(e: PointerEvent): number | null {
    const i = stage.pickCell(e);
    if (i !== session.hover) {
        session.hover = i;
        session.refresh();
    }
    return i;
}

stage.handlers = {
    down: (e, button) => {
        if (button !== 0) return;
        if (track(e) === null && (ed.tool === 'height' || ed.tool === 'terrain')) {
            // за краем карты: расширить её до этой клетки
            const g = stage.pickGround(e);
            if (g) session.doc?.grow(g.x, g.z);
            return;
        }
        tool().down?.(e);
    },
    up: () => tool().up?.(),
    // ПКМ только щелчком: протяжка ПКМ — сдвиг камеры
    click: (e, button) => {
        if (button !== 2) return;
        track(e);
        tool().rightClick?.(e);
    },
    hover: (e) => tool().move?.(e, track(e)),
    leave: () => {
        tool().leave?.();
        session.hover = null;
        session.refresh();
    },
};

window.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    if (ctrl && e.code === 'KeyS') {
        e.preventDefault();
        void saveMap();
    } else if (typing) return;
    else if (ctrl && (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey))) {
        e.preventDefault();
        undo(true);
    } else if (ctrl && e.code === 'KeyZ') {
        e.preventDefault();
        undo();
    } else if (ctrl) return;
    else if (tool().key?.(e)) return;
    else if (e.code === 'KeyT') ed.topView = !ed.topView;
    else if (e.code === 'KeyL') ed.levels = !ed.levels;
    else if (/^Digit[1-9]$/.test(e.code)) ed.tool = TOOL_ORDER[Number(e.code.slice(5)) - 1] ?? ed.tool;
    else if (e.code === 'BracketLeft') ed.brush = 1;
    else if (e.code === 'BracketRight') ed.brush = 3;
});
window.addEventListener('beforeunload', (e) => {
    if (ed.dirty) e.preventDefault();
});

stage.run(() => {});

await startFiles(stage);
