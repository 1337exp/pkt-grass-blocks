// Инструмент «Высота» (клавиша 1). Режим «шаг»: ЛКМ поднимает клетку на уровень или на сегмент (полуровня, по настройке), Shift+ЛКМ или щелчок ПКМ опускает. Режим
// «уровень»: ЛКМ ставит клетки ровно на выбранный уровень (наклон сбрасывается), Alt+ЛКМ или щелчок ПКМ берёт уровень с
// клетки. Кистью с зажатой кнопкой.

import { beginStroke, brushArea, endStroke, strokeAt, strokeBusy, strokeOnce } from '../brush';
import { liftCells, setLevel } from '../ops';
import { session } from '../session';
import { ed } from '../state';
import type { EditorTool } from './tool';

const lift = (sign: 1 | -1) => (cells: number[]): number[] => liftCells(session.doc!.map, cells, sign * ed.heightUnit);
const level = (cells: number[]): number[] => setLevel(session.doc!.map, cells, ed.level);
const levelMode = (): boolean => ed.heightMode === 'level';

/** Пипетка уровня. */
function pickLevel(i: number | null): void {
    const c = i !== null ? session.doc?.map.cells[i] : undefined;
    if (c) ed.level = c.h;
}

export const heightTool: EditorTool = {
    down(e) {
        const i = session.hover;
        if (levelMode()) {
            if (e.altKey) pickLevel(i);
            else beginStroke(level, i);
        } else beginStroke(lift(e.shiftKey ? -1 : 1), i);
    },
    rightClick() {
        if (levelMode()) pickLevel(session.hover);
        else strokeOnce(lift(-1), session.hover);
    },
    move: (_e, cell) => strokeAt(cell),
    up: endStroke,
    area: (cell) => (cell === null ? [] : brushArea(cell)),
    busy: strokeBusy,
};
