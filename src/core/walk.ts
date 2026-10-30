// Площадки, на которые можно встать, и шаг к соседу. Цена шага — дело игры: здесь только геометрия перепада.
// Первая версия хода смотрит на верхнюю площадку колонны. Нижние пролёты уже есть в `floors`, узел «этаж» добавится к ним.

import { materialOf, spansAt, type World } from './world';
import { isSloped, stepRise, type Surface } from './slope';

/** Верх пролёта как площадка. */
export interface Cap extends Surface {
    y0: number;
    material: string;
    standable: boolean;
    liquid: boolean;
}

const STEPS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
] as const;

function capOf(world: World, x: number, z: number, y0: number, y1: number, material: string, corners: Surface['corners']): Cap {
    const info = materialOf(world, material);
    return {
        x,
        z,
        y: y1,
        y0,
        material,
        standable: info?.standable ?? false,
        liquid: info?.liquid ?? false,
        ...(isSloped({ x, z, y: y1, corners }) ? { corners } : {}),
    };
}

/** Верх каждого пролёта, включая воду и стены. */
export function surfaces(world: World): Cap[] {
    const out: Cap[] = [];
    for (const [key, spans] of world.columns) {
        const [xs, zs] = key.split(',');
        const x = Number(xs);
        const z = Number(zs);
        for (const s of spans) out.push(capOf(world, x, z, s.y0, s.y1, s.material, s.corners));
    }
    return out;
}

/** Площадки, на которые можно встать, на всех этажах. */
export function floors(world: World): Cap[] {
    return surfaces(world).filter((c) => c.standable);
}

/**
 * Верхняя площадка каждой колонны. По ней ходит первая версия: мост над пустотой связан с соседом той же высоты,
 * дыра между ними связь рвёт. Нижний пролёт в той же клетке в этот граф не входит.
 */
export function walkCaps(world: World): Cap[] {
    const best = new Map<string, Cap>();
    for (const cap of floors(world)) {
        const key = `${cap.x},${cap.z}`;
        const prev = best.get(key);
        if (!prev || cap.y > prev.y) best.set(key, cap);
    }
    return [...best.values()];
}

export interface Link {
    to: Cap;
    /** Плюс — шаг вверх, в блоках. */
    rise: number;
}

/** Соседи верхней площадки по четырём сторонам. Колонны без площадки (дыра, вода, стена) шага не дают. */
export function links(world: World, from: Cap): Link[] {
    const caps = walkCaps(world);
    const at = (x: number, z: number): Cap | undefined => caps.find((c) => c.x === x && c.z === z);
    const out: Link[] = [];
    for (const [dx, dz] of STEPS) {
        const to = at(from.x + dx, from.z + dz);
        if (to) out.push({ to, rise: stepRise(from, to) });
    }
    return out;
}

/** Есть ли в колонне воздух под верхним пролётом: мост не стоит на полу. */
export function floats(world: World, x: number, z: number): boolean {
    const spans = spansAt(world, x, z);
    const top = spans[spans.length - 1];
    if (!top) return false;
    return top.y0 > 0;
}
