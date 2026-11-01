// Мазок кистью (инструменты «Высота» и «Местность»): от нажатия до отпускания. Снимок для отмены — до первой правки мазка, и
// весь мазок отменяется одним Ctrl+Z. Каждая клетка за мазок меняется один раз: провёл туда-обратно — поднялось на уровень,
// а не на два. Какие клетки под кистью задевает мазок, решает переключатель «Задевает» (всё / сушу / воду).

import { isWater } from '@shared/core/grid';
import type { Snapshot } from './doc';
import { brushCells } from './ops';
import { session } from './session';
import { ed } from './state';

/** Клетки под кистью с центром в `i`, которые она задевает. */
export function brushArea(i: number): number[] {
    const map = session.doc!.map;
    const want = (j: number): boolean => ed.affect === 'all' || isWater(map.cells[j]!.terrain) === (ed.affect === 'water');
    return brushCells(map, i, ed.brush).filter(want);
}

/** `apply` — что инструмент делает с клетками под кистью (возвращает, какие поменялись). */
let stroke: { apply: (cells: number[]) => number[]; before: Snapshot; touched: Set<number>; changed: boolean } | null = null;

export function strokeBusy(): boolean {
    return stroke !== null;
}

/** Мазок дошёл до клетки `i`: новые клетки под кистью — в работу. */
export function strokeAt(i: number | null): void {
    const doc = session.doc;
    if (!doc || !stroke || i === null) return;
    const s = stroke;
    const fresh = brushArea(i).filter((j) => !s.touched.has(j));
    if (!fresh.length) return;
    for (const j of fresh) s.touched.add(j);
    if (!s.apply(fresh).length) return;
    if (!s.changed) doc.history.push(s.before);
    s.changed = true;
    doc.cellsEdited();
}

export function beginStroke(apply: (cells: number[]) => number[], i: number | null): void {
    const doc = session.doc;
    if (!doc) return;
    stroke = { apply, before: doc.snapshot(), touched: new Set(), changed: false };
    strokeAt(i);
}

export function endStroke(): void {
    stroke = null;
}

/** Одна клетка за раз (щелчок ПКМ «опустить»): мазок из одного шага. */
export function strokeOnce(apply: (cells: number[]) => number[], i: number | null): void {
    beginStroke(apply, i);
    endStroke();
}
