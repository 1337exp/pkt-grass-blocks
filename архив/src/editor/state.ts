// Состояние интерфейса редактора: редактор (main.ts) пишет сюда, панель (EditorApp.vue) рисует. Сама карта здесь не живёт:
// она обычный объект в main.ts, а панели узнают о правках по `dirty`. Обратно из панели — только действия (editorActions) и вид.

import { reactive } from 'vue';
import type { Terrain } from '@shared/core/grid';

/** Инструмент правки: высота клеток, местность или склон. */
export type Tool = 'height' | 'terrain' | 'slope';

/** Порядок инструментов — клавиши 1, 2, 3. */
export const TOOL_ORDER: Tool[] = ['height', 'terrain', 'slope'];

/** Какие клетки задевает кисть: все, только суша или только вода (мелководье и глубина). */
export type Affect = 'all' | 'land' | 'water';

/** Режим «Высоты»: ±1 уровень за мазок или поставить ровно на выбранный уровень. */
export type HeightMode = 'step' | 'level';

/** Шаг кисти «шаг»: целый уровень или сегмент (полуровня). */
export type HeightUnit = 1 | 0.5;

/** Клетка под курсором для подсказки над миром: подписи переводит панель. */
export interface TileInfo {
    x: number;
    z: number;
    h: number;
    terrain: Terrain;
    /** Подъёмы углов строкой («0110») или пусто у ровной клетки. */
    slope: string;
}

export const ed = reactive({
    /** Карты в public/maps. */
    maps: [] as string[],
    /** Открытая карта (имя файла) и её имя для людей. */
    id: '',
    name: '',
    /** Есть несохранённые правки. */
    dirty: false,
    /** Идёт загрузка или запись. */
    busy: false,
    /** Последнее сообщение: что сохранено или что пошло не так. */
    status: '',
    error: false,
    topView: false,
    /** Подписи уровней высоты на клетках (кнопка «Уровни») и слишком ли карта велика для подписей. */
    levels: false,
    levelsTooMany: false,
    tile: null as TileInfo | null,
    /** Размер открытой карты («18×14»). */
    size: '',
    tool: 'height' as Tool,
    heightMode: 'step' as HeightMode,
    heightUnit: 1 as HeightUnit,
    /** На какой уровень ставит режим «уровень» (0–9). */
    level: 2,
    /** Чем красит инструмент «Местность». */
    paint: 'plain' as Terrain,
    /** Что задевает кисть (общее для высоты и местности). */
    affect: 'all' as Affect,
    /** Кисть: 1×1 или 3×3 клетки (общая для инструментов). */
    brush: 1 as 1 | 3,
    canUndo: false,
    canRedo: false,
});

/** Действия из панели в редактор: задаёт main.ts. */
export const editorActions = {
    open: (_id: string): void => {},
    /** Новая карта: одна клетка земли (спросит подтверждение и имя файла). */
    create: (): void => {},
    save: (): void => {},
    undo: (): void => {},
    redo: (): void => {},
};
