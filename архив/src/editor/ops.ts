// Правки карты для инструментов редактора: чистые функции над GridMap без графики (тесты в tests/editor.test.ts). Меняют клетки
// на месте и возвращают, какие клетки поменялись: по ним редактор решает, пересобирать ли поле и класть ли правку в историю.

import { type Cell, cornerIndex, type Corners, type Dir, GridMap, isWater, rampCorners, type Terrain } from '@shared/core/grid';
import { MAX_LEVEL, SEGMENTS_PER_LEVEL } from '@shared/core/mapFile';

/** Клетки под кистью `size`×`size` (нечётный) с центром в клетке `i`; у края карты кисть обрезается. */
export function brushCells(map: GridMap, i: number, size: number): number[] {
    const c = map.cells[i]!;
    const r = (size - 1) >> 1;
    const out: number[] = [];
    for (let z = c.z - r; z <= c.z + r; z++) for (let x = c.x - r; x <= c.x + r; x++) if (map.inside(x, z)) out.push(map.index(x, z));
    return out;
}

/** Поднять (`delta` > 0) или опустить клетки на `delta` уровней (1 — целый уровень, 0,5 — сегмент), в пределах 0…MAX_LEVEL. Склон едет целиком: углы считаются от `h`. */
export function liftCells(map: GridMap, cells: number[], delta: number): number[] {
    const changed: number[] = [];
    for (const i of cells) {
        const c = map.cells[i]!;
        // у склона поднятые углы на уровень выше `h`: они тоже не выше MAX_LEVEL
        const top = MAX_LEVEL - (c.corners?.some((v) => v > 0) ? 1 : 0);
        const h = Math.min(top, Math.max(0, c.h + delta));
        if (h === c.h) continue;
        c.h = h;
        changed.push(i);
    }
    return changed;
}

/**
 * Поставить клетки ровно на уровень `level` (0…MAX_LEVEL, с точностью до сегмента), наклон сбрасывается: платформа, отвес, выравнивание одним мазком.
 * Пандусы к платформе потом ставит инструмент «Склон».
 */
export function setLevel(map: GridMap, cells: number[], level: number): number[] {
    const h = Math.min(MAX_LEVEL, Math.max(0, Math.round(level * SEGMENTS_PER_LEVEL) / SEGMENTS_PER_LEVEL));
    const changed: number[] = [];
    for (const i of cells) {
        const c = map.cells[i]!;
        if (c.h === h && !c.corners) continue;
        c.h = h;
        delete c.corners;
        changed.push(i);
    }
    return changed;
}

/**
 * Покрасить клетки в местность `terrain`. Стену не ставим туда, где стоит юнит (`occupied`): формат карты запрещает юнита
 * в стене, и такая карта не сохранится.
 */
export function paintCells(map: GridMap, cells: number[], terrain: Terrain, occupied: (i: number) => boolean = () => false): number[] {
    const changed: number[] = [];
    for (const i of cells) {
        const c = map.cells[i]!;
        if (c.terrain === terrain || (terrain === 'wall' && occupied(i))) continue;
        c.terrain = terrain;
        changed.push(i);
    }
    return changed;
}

/** Куда в клетке показывает курсор для инструмента «Склон»: край (пандус в его сторону) или угол. */
export type SlopeTarget = ({ kind: 'side' } & Dir) | { kind: 'corner'; ix: 0 | 1; iz: 0 | 1 };

/** Доля клетки у угла и у края, где щелчок считается «по углу» и «по краю»; середина клетки — ни то ни другое. */
const NEAR_CORNER = 0.3;
const NEAR_SIDE = 0.3;

/** Цель склона по точке в клетке: (fx, fz) от 0 до 1 от угла (x−, z−). */
export function slopeTarget(fx: number, fz: number): SlopeTarget | null {
    const side = (f: number): 0 | 1 | null => (f < NEAR_CORNER ? 0 : f > 1 - NEAR_CORNER ? 1 : null);
    const ix = side(fx);
    const iz = side(fz);
    if (ix !== null && iz !== null) return { kind: 'corner', ix, iz };
    const edges: ({ d: number } & Dir)[] = [
        { d: fx, dx: -1, dz: 0 },
        { d: 1 - fx, dx: 1, dz: 0 },
        { d: fz, dx: 0, dz: -1 },
        { d: 1 - fz, dx: 0, dz: 1 },
    ];
    edges.sort((a, b) => a.d - b.d);
    const e = edges[0]!;
    return e.d < NEAR_SIDE ? { kind: 'side', dx: e.dx, dz: e.dz } : null;
}

/** Можно ли клетке наклон: на воде и стене склонов нет. */
export const slopeable = (c: Cell): boolean => !isWater(c.terrain) && c.terrain !== 'wall';

/**
 * Склон по цели: край — пандус, поднимающийся в его сторону (повторный щелчок по тому же краю — клетка снова ровная); угол —
 * поднять или опустить этот угол (один поднятый — внешний угловой склон, три — внутренний, как в FM3). Все четыре угла
 * подняты — это просто клетка на уровень выше. Поднятый угол не выше MAX_LEVEL. Возвращает, поменялась ли клетка.
 */
export function applySlope(map: GridMap, i: number, t: SlopeTarget): boolean {
    const c = map.cells[i]!;
    if (!slopeable(c)) return false;
    const was: Corners = c.corners ? [...c.corners] : [0, 0, 0, 0];
    let k: Corners;
    if (t.kind === 'side') {
        const ramp = rampCorners({ dx: t.dx, dz: t.dz });
        k = was.every((v, j) => v === ramp[j]) ? [0, 0, 0, 0] : ramp;
    } else {
        k = [...was];
        const j = cornerIndex(t.ix, t.iz);
        k[j] = k[j] ? 0 : 1;
    }
    if (k.some((v) => v > 0) && c.h >= MAX_LEVEL) return false;
    if (k.every((v) => v > 0)) {
        c.h += 1;
        delete c.corners;
    } else if (k.every((v) => v === 0)) {
        if (!c.corners) return false;
        delete c.corners;
    } else {
        if (was.every((v, j) => v === k[j])) return false;
        c.corners = k;
    }
    return true;
}

/** Сделать клетку ровной (убрать наклон). */
export function flattenCell(map: GridMap, i: number): boolean {
    const c = map.cells[i]!;
    if (!c.corners) return false;
    delete c.corners;
    return true;
}

/** Снимок клеток для отмены: высоты, местность, склоны. */
export type CellsSnapshot = Pick<Cell, 'h' | 'terrain' | 'corners'>[];

export function snapshotCells(map: GridMap): CellsSnapshot {
    return map.cells.map((c) => ({ h: c.h, terrain: c.terrain, corners: c.corners && [...c.corners] }));
}

export function restoreCells(map: GridMap, snap: CellsSnapshot): void {
    snap.forEach((s, i) => {
        const c = map.cells[i]!;
        c.h = s.h;
        c.terrain = s.terrain;
        if (s.corners) c.corners = [...s.corners];
        else delete c.corners;
    });
}

/** Самая большая сторона карты (как у формата файла). */
export const MAX_SIDE = 200;

/**
 * Карта, расширенная так, чтобы в неё вошла клетка (x, z) вне прежних границ: новые клетки — ровная земля на нулевом уровне.
 * Прежние клетки и сущности сдвигаются на месте, если границу двинули влево или вверх. null: клетка уже внутри или карта вышла
 * бы за MAX_SIDE.
 */
export function growMap(map: GridMap, entities: { pos: { x: number; z: number } }[], x: number, z: number): GridMap | null {
    if (map.inside(x, z)) return null;
    const minX = Math.min(0, x);
    const minZ = Math.min(0, z);
    const w = Math.max(map.w - 1, x) - minX + 1;
    const d = Math.max(map.d - 1, z) - minZ + 1;
    if (w > MAX_SIDE || d > MAX_SIDE) return null;
    const cells: Cell[] = [];
    for (let cz = 0; cz < d; cz++) for (let cx = 0; cx < w; cx++) cells.push(map.at(cx + minX, cz + minZ) ?? { x: cx, z: cz, h: 0, terrain: 'plain' });
    for (const c of map.cells) {
        c.x -= minX;
        c.z -= minZ;
    }
    for (const e of entities) {
        e.pos.x -= minX;
        e.pos.z -= minZ;
    }
    return new GridMap(w, d, cells);
}

/** Пустая карта: одна клетка земли. */
export const singleCellMap = (): GridMap => new GridMap(1, 1, [{ x: 0, z: 0, h: 0, terrain: 'plain' }]);

/** Клетки из снимка в карту нужного размера (отмена правки, менявшей размер). */
export function mapFromSnapshot(w: number, d: number, snap: CellsSnapshot): GridMap {
    return new GridMap(w, d, snap.map((s, i) => ({ x: i % w, z: Math.floor(i / w), h: s.h, terrain: s.terrain, ...(s.corners && { corners: [...s.corners] as Corners }) })));
}
