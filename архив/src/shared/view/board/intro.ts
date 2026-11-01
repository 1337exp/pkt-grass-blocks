// Интро уровня (проба): земля вздымается колоннами от центра к краям, затем сверху падают сущности, а в конце загораются линии и подсветка.
// Один параметр `k` от 0 до 1 (время интро, его ведёт Stage), всё остальное считается от него: матрицы колонн и верха клеток (инстансы,
// пересчитываются по кадру: карты в сотни клеток это ничего не стоит), высота фигур и видимость слоёв. `k = 1` возвращает всё как есть.

import * as THREE from 'three';
import type { Metrics } from './metrics';

/** Доли интро: земля встаёт до `TERRAIN_END`, фигуры падают с `PIECES_START` до конца, линии проявляются после земли (тени сущностей проявляются сами, по высоте над землёй: board/shadows.ts). */
const TERRAIN_SPREAD = 0.3;
const TERRAIN_RISE = 0.25;
const PIECES_START = 0.5;
const PIECES_SPREAD = 0.2;
const PIECES_FALL = 0.28;
const LINES_AT = 0.5;
/** Линии краёв и вертикали проявляются плавно за эту долю интро, начиная с `LINES_AT`. */
const LINES_FADE = 0.15;
/** Откуда падают фигуры, в мире. */
const DROP_HEIGHT = 6;

/** Колонна чуть перелетает и садится (как подъём с упругостью), 0 → 1. */
const easeOutBack = (t: number): number => {
    const c = 1.70158;
    const u = t - 1;
    return 1 + (c + 1) * u * u * u + c * u * u;
};

/** Падение с отскоками, 0 → 1. */
const easeOutBounce = (t: number): number => {
    const n = 7.5625;
    const d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
};

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
/** Простая «случайность» по клетке (одна и та же при каждом запуске). */
const hash = (x: number, z: number): number => {
    const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
    return s - Math.floor(s);
};

export interface IntroParts {
    m: Metrics;
    columns: THREE.InstancedMesh;
    tops: THREE.InstancedMesh;
    /** Линии и бока склонов: появляются, когда земля встала. */
    lines: THREE.Object3D[];
    /** Яркость линий краёв и вертикалей (`uAppear` их материалов): растёт от 0 до 1. */
    appear: { value: number }[];
    marks: THREE.Object3D;
    /** Фигуры на поле: объект сцены и клетка. */
    pieces: { obj: THREE.Object3D; cell: { x: number; z: number } }[];
}

const mat = new THREE.Matrix4();
const pos = new THREE.Vector3();
const quat = new THREE.Quaternion();
const scale = new THREE.Vector3();

/** Поставить интро на момент `k` (0…1; 1 и больше: всё на месте). */
export function applyIntro(parts: IntroParts, k: number): void {
    const { m, columns, tops } = parts;
    const cells = m.map.cells;
    const cx = (m.map.w - 1) / 2;
    const cz = (m.map.d - 1) / 2;
    const maxD = Math.hypot(cx, cz) || 1;
    cells.forEach((c, i) => {
        const { x, z } = m.center(c);
        const top = m.topY(c);
        const delay = (Math.hypot(c.x - cx, c.z - cz) / maxD) * TERRAIN_SPREAD;
        const t = k >= 1 ? 1 : clamp01((k - delay) / TERRAIN_RISE);
        const e = t >= 1 ? 1 : easeOutBack(t);
        // колонна растёт от основания, верх клетки едет на её макушке; до старта клетки нет (нулевой масштаб)
        const h = Math.max(top * e, 0);
        if (t <= 0) {
            mat.compose(pos.set(x, 0, z), quat, scale.set(0, 0, 0));
            columns.setMatrixAt(i, mat);
            tops.setMatrixAt(i, mat);
        } else {
            mat.compose(pos.set(x, h / 2, z), quat, scale.set(1, Math.max(h, 1e-4), 1));
            columns.setMatrixAt(i, mat);
            tops.setMatrixAt(i, mat.makeTranslation(x, h + 0.001, z));
        }
    });
    columns.instanceMatrix.needsUpdate = true;
    tops.instanceMatrix.needsUpdate = true;

    for (const line of parts.lines) line.visible = k >= LINES_AT;
    const a = clamp01((k - LINES_AT) / LINES_FADE);
    for (const u of parts.appear) u.value = a * a * (3 - 2 * a);
    parts.marks.visible = k >= 1;
    for (const p of parts.pieces) {
        const c = m.map.at(p.cell.x, p.cell.z);
        if (!c) continue;
        const start = PIECES_START + hash(c.x, c.z) * PIECES_SPREAD;
        const q = k >= 1 ? 1 : clamp01((k - start) / PIECES_FALL);
        p.obj.visible = k >= 1 || k >= start;
        p.obj.position.y = m.surface(c).y + DROP_HEIGHT * (1 - easeOutBounce(q));
    }
}
