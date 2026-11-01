// Углы верхней грани пролёта. Та же математика, что у клетки tactics-proto: пандус, внешний и внутренний угол, перепад шага.

/** Подъёмы углов над низким верхом, в блоках (0 или 1): (x−, z−), (x+, z−), (x+, z+), (x−, z+). */
export type Corners = [number, number, number, number];

/** Направление по сетке. */
export interface Dir {
    dx: -1 | 0 | 1;
    dz: -1 | 0 | 1;
}

/** Площадка, с которой считается перепад: низкий верх и необязательные подъёмы углов. */
export interface Surface {
    x: number;
    z: number;
    /** Высота низких углов, в блоках. */
    y: number;
    corners?: Corners;
}

/** Номер угла (ix, iz: 0 у меньшей координаты, 1 у большей) в Corners. */
export const cornerIndex = (ix: number, iz: number): number => (iz ? (ix ? 2 : 3) : ix ? 1 : 0);

/** Высота угла площадки в блоках. */
export function cornerLevel(s: Surface, ix: number, iz: number): number {
    return s.y + (s.corners?.[cornerIndex(ix, iz)] ?? 0);
}

export const isSloped = (s: Surface): boolean => !!s.corners?.some((v) => v !== 0);

/** Подъёмы углов пандуса, поднимающегося в сторону `d` (подняты два угла этой стороны). */
export function rampCorners(d: Dir): Corners {
    const up = (ix: number, iz: number): number => ((d.dx && (ix ? 1 : -1) === d.dx) || (d.dz && (iz ? 1 : -1) === d.dz) ? 1 : 0);
    return [up(0, 0), up(1, 0), up(1, 1), up(0, 1)];
}

/**
 * По какой диагонали грань складывается на два треугольника: 'a' — через углы (x−, z−) и (x+, z+), 'b' — через другие два.
 * Если один угол выбивается из трёх, диагональ идёт мимо него.
 */
export function foldDiagonal(s: Surface): 'a' | 'b' {
    const k = s.corners;
    if (!k) return 'a';
    for (let i = 0; i < 4; i++) {
        const others = k.filter((_, j) => j !== i);
        if (others.every((v) => v === others[0]) && k[i] !== others[0]) return i % 2 === 0 ? 'b' : 'a';
    }
    return 'a';
}

/** Углы края, обращённого в сторону (dx, dz): пары (ix, iz). */
function sideCorners(dx: number, dz: number): [number, number][] {
    if (dx) return [[dx > 0 ? 1 : 0, 0], [dx > 0 ? 1 : 0, 1]];
    return [[0, dz > 0 ? 1 : 0], [1, dz > 0 ? 1 : 0]];
}

/**
 * Перепад шага с `a` на соседнюю `b` в блоках (плюс: вверх). Общие углы сошлись — шаг ровный.
 * Иначе перепад по средней высоте края, округлённый от нуля.
 */
export function stepRise(a: Surface, b: Surface): number {
    const dx = Math.sign(b.x - a.x);
    const dz = Math.sign(b.z - a.z);
    const own = sideCorners(dx, dz).map(([ix, iz]) => cornerLevel(a, ix, iz));
    const their = sideCorners(dx, dz).map(([ix, iz]) => cornerLevel(b, dx ? 1 - ix : ix, dz ? 1 - iz : iz));
    if (own[0] === their[0] && own[1] === their[1]) return 0;
    const mid = (their[0]! + their[1]!) / 2 - (own[0]! + own[1]!) / 2;
    return mid > 0 ? Math.ceil(mid) : Math.floor(mid);
}

export const cornersEqual = (a?: Corners, b?: Corners): boolean => {
    const left = a ?? [0, 0, 0, 0];
    const right = b ?? [0, 0, 0, 0];
    return left.every((v, i) => v === right[i]);
};
