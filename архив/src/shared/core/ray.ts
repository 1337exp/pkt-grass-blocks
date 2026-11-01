// Луч по сетке карты: высота земли в точке, клетки на пути и границы между ними. Геометрия для линии огня (core/fire.ts), правил здесь нет.

import { type Cell, cornerLevel, type GridMap } from './grid';

export interface Pos {
    x: number;
    z: number;
}

/** Граница клеток на пути луча: доля пути, клетка до и после, сколько граней с перепадом высоты она задевает. */
export interface Crossing {
    t: number;
    from: Pos;
    to: Pos;
    faces: number;
}

/** Высота клетки в её середине, в уровнях (у склона — среднее по диагонали сгиба, как у юнитов). */
export function midLevel(c: Cell): number {
    const k = c.corners;
    return c.h + (k ? Math.max(k[0] + k[2], k[1] + k[3]) / 2 : 0);
}

/** Высота земли клетки `c` в точке `x, z` (зажата в клетку): у ровной её уровень, у склона билинейно по углам. */
export function groundIn(c: Cell, x: number, z: number): number {
    const u = Math.min(1, Math.max(0, x - (c.x - 0.5)));
    const v = Math.min(1, Math.max(0, z - (c.z - 0.5)));
    const near = cornerLevel(c, 0, 0) * (1 - u) + cornerLevel(c, 1, 0) * u;
    const far = cornerLevel(c, 0, 1) * (1 - u) + cornerLevel(c, 1, 1) * u;
    return near * (1 - v) + far * v;
}

/** Точка отрезка `a`→`b` на доле пути `t`. */
export const pointAt = (a: Pos, b: Pos, t: number): Pos => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });

/** Клетка, в которую попадает точка (центры клеток в целых координатах, границы на полклетки). */
const cellOf = (p: Pos): Pos => ({ x: Math.round(p.x), z: Math.round(p.z) });

/**
 * Границы клеток, которые пересекает отрезок между центрами `a` и `b`, по порядку. Обычно у границы одна грань; луч точно через угол
 * клеток задевает до четырёх граней (у прямой стены две: по обе стороны угла).
 */
export function crossings(map: GridMap, a: Pos, b: Pos): Crossing[] {
    const ts: number[] = [];
    for (const d of [b.x - a.x, b.z - a.z]) for (let n = 0; n < Math.abs(d); n++) ts.push((n + 0.5) / Math.abs(d));
    ts.sort((m, n) => m - n);
    const out: Crossing[] = [];
    for (const t of ts) {
        if (out.length && t - out[out.length - 1]!.t < 1e-9) continue; // угол: обе плоскости на одной доле пути
        const from = cellOf(pointAt(a, b, t - 1e-6));
        const to = cellOf(pointAt(a, b, t + 1e-6));
        let faces = 1;
        if (from.x !== to.x && from.z !== to.z) {
            const p = pointAt(a, b, t);
            const g = (c: Pos): number => {
                const cell = map.at(c.x, c.z);
                return cell ? groundIn(cell, p.x, p.z) : NaN;
            };
            const quad = [g(from), g({ x: to.x, z: from.z }), g(to), g({ x: from.x, z: to.z })];
            faces = quad.filter((h, i) => Math.abs(h - quad[(i + 1) % 4]!) > 1e-6).length;
        }
        out.push({ t, from, to, faces });
    }
    return out;
}

/**
 * Клетки, которые пересекает отрезок между центрами `a` и `b` (без самих концов), по порядку, с долей пути до середины отрезка
 * внутри клетки (там на луче и ставится отметка). Отрезок проходится мелкими шагами: карта маленькая, так проще и надёжнее,
 * чем точный обход сетки.
 */
export function cellsOnLine(a: Pos, b: Pos): (Pos & { t: number })[] {
    const runs: { x: number; z: number; from: number; to: number }[] = [];
    const steps = Math.max(1, Math.ceil((Math.abs(b.x - a.x) + Math.abs(b.z - a.z)) * 16));
    for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const { x, z } = cellOf(pointAt(a, b, t));
        const last = runs[runs.length - 1];
        if (last && last.x === x && last.z === z) last.to = t;
        else runs.push({ x, z, from: t, to: t });
    }
    return runs.filter((r) => !(r.x === a.x && r.z === a.z) && !(r.x === b.x && r.z === b.z)).map((r) => ({ x: r.x, z: r.z, t: (r.from + r.to) / 2 }));
}
