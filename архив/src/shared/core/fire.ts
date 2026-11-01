// Линия огня для прямого выстрела (COMBAT.md): луч от груди стрелка к груди цели в трёх измерениях против карты. Закрывает
// стена (местность), сущность, которая закрывает огонь (контейнер, мех), и рельеф: луч ниже верха обрыва на границе клеток с
// перепадом высоты. Дерево не закрывает, но мешает (помеха); и то и другое только пока луч ниже верха сущности (каталог, `cover`).
// Если рельеф мешает лучу в грудь, пробуем луч в макушку цели: он проходит, значит цель частично видна, выстрел идёт с помехой
// (красный ✕ в каждом месте, где мешал луч в грудь, и штраф точности); не проходит, закрыто. Вверх (край платформы цели), вниз (свой
// край под ногами, крутой выстрел) и поперёк холма это одно правило. Навесному оружию и ближнему бою линия не нужна. Только правила,
// без графики; геометрия луча в `ray.ts`.

import type { FireThrough } from './catalog';
import type { GridMap } from './grid';
import { cellsOnLine, crossings, groundIn, midLevel, type Pos, pointAt } from './ray';

export { cellsOnLine } from './ray';

/** Высота груди над клеткой, в уровнях: отсюда стреляют и сюда целятся (70% роста меха 0,44: 0,31 мира при уровне 0,4). */
export const CHEST_LEVELS = 0.8;

/** Высота макушки цели над клеткой, в уровнях (рост меха 0,44 мира при уровне 0,4): если грудь за краем, но макушку видно, это помеха. */
export const HEAD_LEVELS = 1.1;

/** Что на пути: клетка, доля пути до места на луче (0 — стрелок, 1 — цель), что именно. */
export interface FireHit {
    x: number;
    z: number;
    t: number;
    /** wall — стена-местность, entity — сущность на клетке, height — рельеф выше луча, edge — луч в грудь упёрся в обрыв, а в макушку проходит (помеха). */
    why: 'wall' | 'entity' | 'height' | 'edge';
}

export interface FireLine {
    /** Первое, что закрывает выстрел (null — линия свободна). */
    blocked: FireHit | null;
    /** Помехи до преграды (деревья, сущности, края обрывов): выстрел возможен, но труднее. По порядку вдоль линии. */
    partial: FireHit[];
}

/** Где рельеф мешает: клетка верхней стороны границы, доля пути, граней с перепадом. */
interface Obstruction {
    x: number;
    z: number;
    t: number;
    faces: number;
}

/** Границы с перепадом высоты, на которых луч от высоты `ya` над клеткой `a` до `yb` над клеткой `b` ниже верха перепада. */
function terrainObstructions(map: GridMap, a: Pos, b: Pos, ya: number, yb: number): Obstruction[] {
    const out: Obstruction[] = [];
    for (const { t, from, to, faces } of crossings(map, a, b)) {
        const cf = map.at(from.x, from.z);
        const ct = map.at(to.x, to.z);
        if (!cf || !ct) continue;
        const p = pointAt(a, b, t);
        const sf = groundIn(cf, p.x, p.z);
        const st = groundIn(ct, p.x, p.z);
        if (Math.abs(sf - st) < 1e-6) continue;
        if (ya + (yb - ya) * t < Math.max(sf, st)) out.push({ ...(sf > st ? from : to), t, faces });
    }
    return out;
}

/** Рельеф на пути: закрыто (луч в макушку тоже мешает) или помехи (грудь мешает, макушку видно). */
function terrainLine(map: GridMap, a: Pos, b: Pos, ya: number, yChest: number, yHead: number): { blocked: FireHit | null; edges: FireHit[] } {
    const chest = terrainObstructions(map, a, b, ya, yChest);
    if (!chest.length) return { blocked: null, edges: [] };
    const head = terrainObstructions(map, a, b, ya, yHead);
    if (head.length) return { blocked: { x: head[0]!.x, z: head[0]!.z, t: head[0]!.t, why: 'height' }, edges: [] };
    return { blocked: null, edges: chest.flatMap((o) => Array.from({ length: o.faces }, () => ({ x: o.x, z: o.z, t: o.t, why: 'edge' as const }))) };
}

/**
 * Линия огня от клетки `a` к клетке `b`. `fireAt(x, z)` — что сущность на клетке делает с выстрелом сквозь неё (нет сущности —
 * 'clear'). `coverAt(x, z)` — до какой высоты (в уровнях над клеткой) сущность на ней прикрывает: луч выше — выстрел идёт над ней
 * (без неё сущность прикрывает на любой высоте). `altA` и `altB` — на сколько уровней стрелок и цель над своими клетками (вертолёт): луч идёт от груди на этой высоте.
 */
export function lineOfFire(
    map: GridMap,
    a: Pos,
    b: Pos,
    fireAt: (x: number, z: number) => FireThrough,
    altA = 0,
    altB = 0,
    coverAt: (x: number, z: number) => number = () => Infinity,
): FireLine {
    const ya = midLevel(map.at(a.x, a.z)!) + altA + CHEST_LEVELS;
    const base = midLevel(map.at(b.x, b.z)!) + altB;
    const yb = base + CHEST_LEVELS;
    const ground = terrainLine(map, a, b, ya, yb, base + HEAD_LEVELS);
    const cut = ground.blocked?.t ?? Infinity;
    const partial: FireHit[] = [];
    // итог: помехи только до преграды, по порядку вдоль линии
    const result = (blocked: FireHit | null): FireLine => {
        const until = blocked?.t ?? Infinity;
        return { blocked, partial: [...partial, ...ground.edges].filter((h) => h.t < until).sort((m, n) => m.t - n.t) };
    };
    for (const { x, z, t } of cellsOnLine(a, b)) {
        if (t >= cut) break;
        const c = map.at(x, z)!;
        if (c.terrain === 'wall') return result({ x, z, t, why: 'wall' });
        const f = fireAt(x, z);
        if (f !== 'clear' && ya + (yb - ya) * t >= midLevel(c) + coverAt(x, z)) continue; // выстрел идёт над сущностью
        if (f === 'blocked') return result({ x, z, t, why: 'entity' });
        if (f === 'partial') partial.push({ x, z, t, why: 'entity' });
    }
    return result(ground.blocked);
}
