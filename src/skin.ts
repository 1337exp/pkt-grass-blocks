// Общий меш карты по сетке высот: одна поверхность вместо куба на клетку.
// Внутренних граней между соседями нет. Скругление и навес только на открытых рёбрах: верхняя грань и стенки там,
// где сосед ниже. Поэтому на стыках одинаковой высоты геометрия непрерывна и шва нет.

import * as THREE from 'three';

export interface HeightMap {
    w: number;
    d: number;
    /** Высота колонок в уровнях, построчно (z, затем x). 0 значит пусто. */
    heights: readonly number[];
}

/** Высота одного уровня в мире. */
export const LEVEL = 1;

/** Шагов скругления на каждые 45 градусов дуги. */
const STEPS = 4;

/** На каком расстоянии от угла стенки камень перестаёт ложиться: у углов остаётся одна земля. */
export const CORNER_REACH = 0.3;

/** На каком расстоянии от высокой стенки заканчивается тень на нижнем ярусе. */
export const SHADE_REACH = 0.55;

export const heightAt = (m: HeightMap, i: number, j: number): number =>
    i < 0 || j < 0 || i >= m.w || j >= m.d ? 0 : (m.heights[j * m.w + i] ?? 0);

/** По четырём сторонам колонки: w это -x, e это +x, n это -z, s это +z. */
export interface Sides {
    w: boolean;
    e: boolean;
    n: boolean;
    s: boolean;
}

/** С каких сторон колонка открыта: там сосед ниже. */
export function exposure(m: HeightMap, i: number, j: number): Sides {
    const h = heightAt(m, i, j);
    return {
        w: heightAt(m, i - 1, j) < h,
        e: heightAt(m, i + 1, j) < h,
        n: heightAt(m, i, j - 1) < h,
        s: heightAt(m, i, j + 1) < h,
    };
}

/** С каких сторон колонка затенена: там сосед выше, и его стенка отбрасывает тень на нашу верхнюю грань. */
export function shaded(m: HeightMap, i: number, j: number): Sides {
    const h = heightAt(m, i, j);
    return {
        w: heightAt(m, i - 1, j) > h,
        e: heightAt(m, i + 1, j) > h,
        n: heightAt(m, i, j - 1) > h,
        s: heightAt(m, i, j + 1) > h,
    };
}

/** Внутренний угол контура обрыва: диагональный сосед ниже, а соседи по сторонам не ниже. Верх там скругляется по расстоянию до угловой точки. */
export function reflexCorners(m: HeightMap, i: number, j: number, pad: number): { x: number; z: number }[] {
    const h = heightAt(m, i, j);
    const x0 = i - m.w / 2;
    const z0 = j - m.d / 2;
    const out: { x: number; z: number }[] = [];
    for (const dx of [-1, 1]) {
        for (const dz of [-1, 1]) {
            if (heightAt(m, i + dx, j + dz) >= h) continue;
            if (heightAt(m, i + dx, j) < h || heightAt(m, i, j + dz) < h) continue;
            out.push({ x: x0 + (dx > 0 ? 1 : 0) + dx * pad, z: z0 + (dz > 0 ? 1 : 0) + dz * pad });
        }
    }
    return out;
}

const smooth = (a: number, b: number, x: number): number => {
    const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
    return t * t * (3 - 2 * t);
};

/** Тень на верхней грани клетки от высоких соседей: 0 вдали, 1 у самой стенки. */
export function occlusion(x0: number, z0: number, sides: Sides, pad: number, x: number, z: number): number {
    const f = (d: number): number => 1 - smooth(0, SHADE_REACH, Math.max(0, d));
    let o = 0;
    if (sides.w) o = Math.max(o, f(x - x0 - pad));
    if (sides.e) o = Math.max(o, f(x0 + 1 - pad - x));
    if (sides.n) o = Math.max(o, f(z - z0 - pad));
    if (sides.s) o = Math.max(o, f(z0 + 1 - pad - z));
    return o;
}

/** На сколько округлая кромка ниже плоского верха на расстоянии `edge` от обрыва. */
export function drop(edge: number, r: number): number {
    if (r <= 0 || edge >= r) return 0;
    const k = r - edge;
    return r - Math.sqrt(Math.max(0, r * r - k * k));
}

export interface SkinOptions {
    /** Насколько оболочка выступает наружу на открытых сторонах. */
    pad: number;
    /** Насколько оболочка выше верха колонки. */
    lift: number;
    /** Радиус скругления открытых рёбер, 0 значит острые. */
    radius: number;
    /** На сколько геометрия опущена под расчётный верх. Камню нужно лежать ниже травяной оболочки, иначе их верхние грани совпадают и мерцают. */
    topDrop?: number;
    /** Подкладывать пол на уровне соседей под открытыми колонками: иначе у скруглённых углов видна пустота. */
    floors?: boolean;
}

/** Пол под открытой колонкой: уровень самого высокого из ниже стоящих соседей и клетка, из которой берётся оттенок. null, если пола не нужно. */
export function floorOf(m: HeightMap, i: number, j: number): { level: number; i: number; j: number } | null {
    const h = heightAt(m, i, j);
    let best: { level: number; i: number; j: number } | null = null;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nb = heightAt(m, i + di, j + dj);
        if (nb > 0 && nb < h && (!best || nb > best.level)) best = { level: nb, i: i + di, j: j + dj };
    }
    return best;
}

/**
 * Координаты линий сетки вдоль оси от `lo` до `hi`. Возле открытой стороны линии стоят по тангенсам дуги,
 * поэтому после скругления вершины ложатся по дуге почти равномерно. `extra` добавляет линии для тени и внутренних углов.
 */
function axisLine(lo: number, hi: number, loOpen: boolean, hiOpen: boolean, r: number, extra: number[] = []): number[] {
    const out: number[] = [];
    const quarter = Math.PI / 4;
    if (loOpen && r > 0) {
        for (let k = 0; k <= STEPS; k++) out.push(lo + r - r * Math.tan(quarter * (1 - k / STEPS)));
    } else {
        out.push(lo);
    }
    const innerHi = hiOpen && r > 0 ? hi - r : hi;
    if ((out[out.length - 1] ?? lo) < innerHi - 1e-9) out.push(innerHi);
    if (hiOpen && r > 0) {
        for (let k = 1; k <= STEPS; k++) out.push(innerHi + r * Math.tan((quarter * k) / STEPS));
    }
    for (const e of extra) if (e > lo + 1e-4 && e < hi - 1e-4) out.push(e);
    out.sort((a, b) => a - b);
    return out.filter((v, k) => k === 0 || v - (out[k - 1] ?? v) > 1e-4);
}

type Vec3 = [number, number, number];

/** Геометрия оболочки карты: позиции, нормали, высота верха колонки (aTop), номер клетки (aCell) и тень от высоких стенок (aShade). */
export function buildSkin(m: HeightMap, o: SkinOptions): THREE.BufferGeometry {
    const pos: number[] = [];
    const nor: number[] = [];
    const topAttr: number[] = [];
    const cellAttr: number[] = [];
    const shadeAttr: number[] = [];
    const cornerAttr: number[] = [];
    const index: number[] = [];
    const r = o.radius;
    const quarter = Math.PI / 4;

    for (let j = 0; j < m.d; j++) {
        for (let i = 0; i < m.w; i++) {
            const h = heightAt(m, i, j);
            if (h <= 0) continue;

            const cell = j * m.w + i;
            const topY = h * LEVEL + o.lift;
            const surf = topY - (o.topDrop ?? 0);
            const ex = exposure(m, i, j);
            const sh = shaded(m, i, j);
            const corners = reflexCorners(m, i, j, o.pad);
            const x0 = i - m.w / 2;
            const z0 = j - m.d / 2;
            const xmin = x0 - (ex.w ? o.pad : 0);
            const xmax = x0 + 1 + (ex.e ? o.pad : 0);
            const zmin = z0 - (ex.n ? o.pad : 0);
            const zmax = z0 + 1 + (ex.s ? o.pad : 0);

            // Внутренний ящик для скругления: сжат на радиус только с открытых сторон и сверху.
            const lo: Vec3 = [ex.w && r > 0 ? xmin + r : -Infinity, -Infinity, ex.n && r > 0 ? zmin + r : -Infinity];
            const hi: Vec3 = [ex.e && r > 0 ? xmax - r : Infinity, r > 0 ? surf - r : Infinity, ex.s && r > 0 ? zmax - r : Infinity];

            const addPatch = (
                us: number[],
                vs: number[],
                at: (u: number, v: number) => Vec3,
                face: Vec3,
                top = false,
                flat?: { top: number; cell: number },
                corner?: (u: number) => number,
            ): void => {
                const base = pos.length / 3;
                for (const v of vs) {
                    for (const u of us) {
                        const p = at(u, v);
                        let n: Vec3 = face;
                        const q: Vec3 = [
                            Math.min(Math.max(p[0], lo[0]), hi[0]),
                            Math.min(Math.max(p[1], lo[1]), hi[1]),
                            Math.min(Math.max(p[2], lo[2]), hi[2]),
                        ];
                        const d: Vec3 = [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
                        const len = Math.hypot(d[0], d[1], d[2]);
                        if (!flat && r > 0 && len > 1e-7) {
                            n = [d[0] / len, d[1] / len, d[2] / len];
                            p[0] = q[0] + n[0] * r;
                            p[1] = q[1] + n[1] * r;
                            p[2] = q[2] + n[2] * r;
                        }
                        let shade = 0;
                        if (top) {
                            shade = occlusion(x0, z0, sh, o.pad, p[0], p[2]);
                            // Внутренний угол обрыва: верх скругляется по расстоянию до угловой точки, как конус.
                            for (const c of corners) {
                                const dx = p[0] - c.x;
                                const dz = p[2] - c.z;
                                const dist = Math.hypot(dx, dz);
                                if (r > 0 && dist < r) {
                                    const k = r - dist;
                                    const slope = k / Math.sqrt(Math.max(r * r - k * k, 1e-6));
                                    p[1] -= drop(dist, r);
                                    const inv = dist > 1e-6 ? 1 / dist : 0;
                                    const nx = -slope * dx * inv;
                                    const nz = -slope * dz * inv;
                                    const nl = Math.hypot(nx, 1, nz);
                                    n = [nx / nl, 1 / nl, nz / nl];
                                }
                            }
                        }
                        pos.push(p[0], p[1], p[2]);
                        nor.push(n[0], n[1], n[2]);
                        topAttr.push(flat ? flat.top : topY);
                        cellAttr.push(flat ? flat.cell : cell);
                        shadeAttr.push(shade);
                        cornerAttr.push(corner ? corner(u) : 0);
                    }
                }

                // Порядок обхода: по сырой плоской сетке, чтобы лицо смотрело наружу.
                const a = at(us[0] ?? 0, vs[0] ?? 0);
                const eu = at(us[1] ?? 0, vs[0] ?? 0).map((c, k) => c - (a[k] ?? 0));
                const ev = at(us[0] ?? 0, vs[1] ?? 0).map((c, k) => c - (a[k] ?? 0));
                const cross = [
                    (eu[1] ?? 0) * (ev[2] ?? 0) - (eu[2] ?? 0) * (ev[1] ?? 0),
                    (eu[2] ?? 0) * (ev[0] ?? 0) - (eu[0] ?? 0) * (ev[2] ?? 0),
                    (eu[0] ?? 0) * (ev[1] ?? 0) - (eu[1] ?? 0) * (ev[0] ?? 0),
                ];
                const outward = cross[0]! * face[0] + cross[1]! * face[1] + cross[2]! * face[2] > 0;
                const nu = us.length;
                for (let iv = 0; iv < vs.length - 1; iv++) {
                    for (let iu = 0; iu < nu - 1; iu++) {
                        const p00 = base + iv * nu + iu;
                        const p10 = p00 + 1;
                        const p01 = p00 + nu;
                        const p11 = p01 + 1;
                        if (outward) index.push(p00, p10, p01, p10, p11, p01);
                        else index.push(p00, p01, p10, p10, p01, p11);
                    }
                }
            };

            // Строки стенки: от низа до верха, у верха густо по дуге.
            const rows = (bottom: number): number[] => {
                const out = [bottom];
                if (r > 0) {
                    const inner = surf - r;
                    out.push(inner);
                    for (let k = 1; k <= STEPS; k++) out.push(inner + r * Math.tan((quarter * k) / STEPS));
                } else {
                    out.push(surf);
                }
                return out;
            };
            const floor = (ni: number, nj: number): number => {
                const nb = heightAt(m, ni, nj);
                return nb > 0 ? nb * LEVEL + o.lift - (o.topDrop ?? 0) : 0;
            };

            // Лишние линии верхней грани: для плавной тени у высоких стенок и для скругления вокруг внутренних углов.
            const stops = [0.12, 0.3, SHADE_REACH];
            const topX: number[] = [];
            const topZ: number[] = [];
            if (sh.w) topX.push(...stops.map((s) => x0 + o.pad + s));
            if (sh.e) topX.push(...stops.map((s) => x0 + 1 - o.pad - s));
            if (sh.n) topZ.push(...stops.map((s) => z0 + o.pad + s));
            if (sh.s) topZ.push(...stops.map((s) => z0 + 1 - o.pad - s));
            for (const c of corners) {
                const along = Array.from({ length: STEPS }, (_, k) => r * Math.tan((quarter * (k + 1)) / STEPS));
                topX.push(...along.map((t) => c.x - Math.sign(c.x - (x0 + 0.5)) * t));
                topZ.push(...along.map((t) => c.z - Math.sign(c.z - (z0 + 0.5)) * t));
            }

            addPatch(
                axisLine(xmin, xmax, ex.w, ex.e, r, topX),
                axisLine(zmin, zmax, ex.n, ex.s, r, topZ),
                (u, v) => [u, surf, v],
                [0, 1, 0],
                true,
            );
            // Углы стенки: открытый сосед по краю (выпуклый угол) или внутренний угол, где обрыв заворачивает. Возле них камень не кладём.
            const notLower = (ni: number, nj: number): boolean => heightAt(m, ni, nj) >= h;
            const cornerMask =
                (lo: number, hi: number, a: boolean, b: boolean) =>
                (u: number): number =>
                    Math.max(a ? 1 - smooth(0, CORNER_REACH, u - lo) : 0, b ? 1 - smooth(0, CORNER_REACH, hi - u) : 0);
            const cornerStops = (lo: number, hi: number, a: boolean, b: boolean): number[] => [
                ...(a ? [0.1, 0.2, CORNER_REACH].map((t) => lo + t) : []),
                ...(b ? [0.1, 0.2, CORNER_REACH].map((t) => hi - t) : []),
            ];
            const wall = (
                lo: number,
                hi: number,
                a: boolean,
                b: boolean,
                open: [boolean, boolean],
                bottom: number,
                at: (u: number, v: number) => Vec3,
                face: Vec3,
                zone: [number, number],
            ): void =>
                addPatch(
                    axisLine(zone[0], zone[1], open[0], open[1], r, cornerStops(lo, hi, a, b)),
                    rows(bottom),
                    at,
                    face,
                    false,
                    undefined,
                    cornerMask(lo, hi, a, b),
                );
            if (ex.e) wall(z0, z0 + 1, ex.n || notLower(i + 1, j - 1), ex.s || notLower(i + 1, j + 1), [ex.n, ex.s], floor(i + 1, j), (u, v) => [xmax, v, u], [1, 0, 0], [zmin, zmax]);
            if (ex.w) wall(z0, z0 + 1, ex.n || notLower(i - 1, j - 1), ex.s || notLower(i - 1, j + 1), [ex.n, ex.s], floor(i - 1, j), (u, v) => [xmin, v, u], [-1, 0, 0], [zmin, zmax]);
            if (ex.s) wall(x0, x0 + 1, ex.w || notLower(i - 1, j + 1), ex.e || notLower(i + 1, j + 1), [ex.w, ex.e], floor(i, j + 1), (u, v) => [u, v, zmax], [0, 0, 1], [xmin, xmax]);
            if (ex.n) wall(x0, x0 + 1, ex.w || notLower(i - 1, j - 1), ex.e || notLower(i + 1, j - 1), [ex.w, ex.e], floor(i, j - 1), (u, v) => [u, v, zmin], [0, 0, -1], [xmin, xmax]);

            // Пол под колонкой на уровне соседей: у скруглённых углов видна земля, а не пустота.
            const base = o.floors ? floorOf(m, i, j) : null;
            if (base) {
                const y = base.level * LEVEL + o.lift;
                addPatch([x0, x0 + 1], [z0, z0 + 1], (u, v) => [u, y, v], [0, 1, 0], false, { top: y, cell: base.j * m.w + base.i });
            }
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('aTop', new THREE.Float32BufferAttribute(topAttr, 1));
    geo.setAttribute('aCell', new THREE.Float32BufferAttribute(cellAttr, 1));
    geo.setAttribute('aShade', new THREE.Float32BufferAttribute(shadeAttr, 1));
    geo.setAttribute('aCorner', new THREE.Float32BufferAttribute(cornerAttr, 1));
    geo.setIndex(index);
    geo.computeBoundingSphere();
    return geo;
}
