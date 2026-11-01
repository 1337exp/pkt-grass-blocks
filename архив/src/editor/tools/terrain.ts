// Инструмент «Местность» (клавиша 2): ЛКМ красит выбранной местностью из палитры, кистью с зажатой кнопкой; Alt+ЛКМ или щелчок
// ПКМ — пипетка (берёт тип с клетки). Стену под сущность не ставит: формат карты запрещает юнита и объект в стене.

import { beginStroke, brushArea, endStroke, strokeAt, strokeBusy } from '../brush';
import { paintCells } from '../ops';
import { session } from '../session';
import { ed } from '../state';
import type { EditorTool } from './tool';

const paint = (cells: number[]): number[] => {
    const doc = session.doc!;
    const taken = new Set(doc.entities.map((e) => doc.map.index(e.pos.x, e.pos.z)));
    return paintCells(doc.map, cells, ed.paint, (i) => taken.has(i));
};

function pick(i: number | null): void {
    const c = i !== null ? session.doc?.map.cells[i] : undefined;
    if (c) ed.paint = c.terrain;
}

export const terrainTool: EditorTool = {
    down(e) {
        if (e.altKey) pick(session.hover);
        else beginStroke(paint, session.hover);
    },
    rightClick: () => pick(session.hover),
    move: (_e, cell) => strokeAt(cell),
    up: endStroke,
    area: (cell) => (cell === null ? [] : brushArea(cell)),
    busy: strokeBusy,
};
