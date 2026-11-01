// Инструмент «Склон» (клавиша 3): ЛКМ у края клетки — пандус в эту сторону (повторно — убрать), у угла — поднять или опустить
// угол; щелчок ПКМ — сделать ровной. Подсказка на клетке (край или уголок) показывает, что изменит щелчок. Кисти нет.

import type { Stage } from '@shared/view/stage';
import { applySlope, flattenCell, slopeable, slopeTarget, type SlopeTarget } from '../ops';
import { session } from '../session';
import type { EditorTool } from './tool';

/** Цель склона под курсором: клетка и её край или угол (по точке попадания). */
function slopeAt(stage: Stage, e: PointerEvent): { i: number; t: SlopeTarget | null } | null {
    const doc = session.doc;
    const hit = stage.pickHit(e);
    if (!hit || !doc) return null;
    const c = doc.map.cells[hit.i]!;
    // на воде и стене склона не бывает: и подсказки нет
    if (!slopeable(c)) return { i: hit.i, t: null };
    const { x, z } = doc.board.center(c);
    const clamp = (v: number): number => Math.min(1, Math.max(0, v));
    return { i: hit.i, t: slopeTarget(clamp(hit.point.x - x + 0.5), clamp(hit.point.z - z + 0.5)) };
}

function showHint(stage: Stage, e: PointerEvent | null): void {
    const s = e ? slopeAt(stage, e) : null;
    session.doc?.board.setEditHint(s?.i ?? null, s?.t ? (s.t.kind === 'side' ? { dx: s.t.dx, dz: s.t.dz } : { ix: s.t.ix, iz: s.t.iz }) : null);
}

export function slopeTool(stage: Stage): EditorTool {
    return {
        down(e) {
            const s = slopeAt(stage, e);
            const doc = session.doc;
            if (doc && s?.t) doc.edit('cells', () => applySlope(doc.map, s.i, s.t!));
            showHint(stage, e);
        },
        rightClick() {
            const doc = session.doc;
            const i = session.hover;
            if (doc && i !== null) doc.edit('cells', () => flattenCell(doc.map, i));
        },
        move: (e) => showHint(stage, e),
        leave: () => showHint(stage, null),
        deactivate: () => showHint(stage, null),
        area: () => [],
    };
}
