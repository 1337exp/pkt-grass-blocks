// Тестовая карта: холмы уступами, река (глубокое русло и мелкие берега) с бродом, дорога через карту, пятна бурелома, обломок
// стены и пара контейнеров, пандусы на подъёмах дороги и кое-где на склонах. Рельеф из детерминированного шума, поэтому карта одна и та же при каждом запуске.

import { type Cell, cornerLevel, type Corners, type Dir, GridMap, isSloped, rampCorners, stepRise, type Terrain } from './grid';

export const MAP_W = 18;
export const MAP_D = 14;
/** Самый высокий уровень холмов. */
const MAX_H = 5;
/** Стены и контейнеры: клетки (x, z). Не на дороге и не на воде. */
/** Обломок стены на холме: это местность (вечная, без здоровья). */
const WALLS: [number, number][] = [
    [10, 2],
    [11, 2],
    [12, 2],
];

/** Контейнеры у врагов: это объекты (ENTITIES.md), их ставит скрипт основы (scripts/gen-map.ts) сущностями. */
export const CONTAINERS: [number, number][] = [
    [14, 9],
    [15, 9],
    [15, 10],
];

function rng(seed: number): () => number {
    let t = seed >>> 0;
    return () => {
        t = (t + 0x6d2b79f5) >>> 0;
        let x = Math.imul(t ^ (t >>> 15), 1 | t);
        x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
}

/** Плавный шум: сумма нескольких синусоид со случайными направлениями и фазами. */
function noise2(seed: number, waves: number, scale: number): (x: number, z: number) => number {
    const r = rng(seed);
    const list = Array.from({ length: waves }, () => ({ a: r() * Math.PI * 2, f: (0.6 + r() * 0.8) * scale, p: r() * Math.PI * 2, k: 0.5 + r() * 0.5 }));
    const norm = list.reduce((s, w) => s + w.k, 0);
    return (x, z) => list.reduce((s, w) => s + w.k * Math.sin((x * Math.cos(w.a) + z * Math.sin(w.a)) * w.f + w.p), 0) / norm;
}

const SIDES: Dir[] = [
    { dx: 1, dz: 0 },
    { dx: -1, dz: 0 },
    { dx: 0, dz: 1 },
    { dx: 0, dz: -1 },
];

/**
 * Пандусы: клетка становится наклонной, если впереди ровно на уровень выше, а сзади вровень (по ней тогда въезжают без ступеньки).
 * На дороге — везде, где она поднимается (дорога не карабкается ступенями); на склонах — изредка, по хешу клетки, и не вплотную
 * к другому пандусу (иначе склоны превращаются в сплошные горки и перестают читаться уступами).
 */
function placeRamps(map: GridMap, roadZ: number): void {
    const fits = (c: Cell, d: Dir): boolean => {
        const ahead = map.at(c.x + d.dx, c.z + d.dz);
        const behind = map.at(c.x - d.dx, c.z - d.dz);
        return !!ahead && !!behind && !isSloped(ahead) && ahead.h === c.h + 1 && behind.h === c.h && behind.terrain !== 'wall' && ahead.terrain !== 'wall';
    };
    const flat = (c: Cell): boolean => c.terrain === 'plain' || c.terrain === 'road';
    for (const c of map.cells) {
        if (!flat(c)) continue;
        const onRoad = c.z === roadZ && c.terrain === 'road';
        const near = map.neighbors(c).some((n) => isSloped(n));
        const lucky = ((c.x * 928371 + c.z * 364479) % 100) / 100 < 0.22;
        if (!onRoad && (near || !lucky)) continue;
        const d = SIDES.find((s) => (onRoad ? s.dz === 0 : true) && fits(c, s));
        if (!d) continue;
        c.corners = rampCorners(d);
        if (onRoad) continue;
        // склон продолжается полосой вбок, пока уступ позволяет: так въезд шире, а на изгибе холма полосы сходятся углом
        for (const side of [-1, 1]) {
            for (let k = 1; k < 4; k++) {
                const n = map.at(c.x + side * k * Math.abs(d.dz), c.z + side * k * Math.abs(d.dx));
                if (!n || !flat(n) || isSloped(n) || n.h !== c.h || !fits(n, d)) break;
                n.corners = rampCorners(d);
            }
        }
    }
}

/**
 * Угловые склоны там, где пандусы сходятся углом (изгиб склона холма): ровная клетка поднимает один угол (внешний изгиб) или
 * три (внутренний), если после этого она стыкуется без ступенек хотя бы с одним наклонным краем соседа, а с остальными либо
 * стыкуется, либо остаётся обрывом целиком (без «полуступенек»). Так скругляются концы полос пандусов и изгибы склонов.
 */
function placeCorners(map: GridMap): void {
    const CANDIDATES: Corners[] = [];
    for (let i = 0; i < 4; i++) {
        const one: Corners = [0, 0, 0, 0];
        one[i] = 1;
        CANDIDATES.push(one, one.map((v) => 1 - v) as Corners);
    }
    const sides: [number, number][] = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
    ];
    for (const c of map.cells) {
        if (isSloped(c) || (c.terrain !== 'plain' && c.terrain !== 'road')) continue;
        for (const k of CANDIDATES) {
            c.corners = k;
            let joins = 0;
            let ok = true;
            for (const [dx, dz] of sides) {
                const nb = map.at(c.x + dx, c.z + dz);
                if (!nb) continue;
                const rise = stepRise(c, nb);
                // общие углы: точки на стыке у меня и у соседа
                const mine = dx ? [cornerLevel(c, dx > 0 ? 1 : 0, 0), cornerLevel(c, dx > 0 ? 1 : 0, 1)] : [cornerLevel(c, 0, dz > 0 ? 1 : 0), cornerLevel(c, 1, dz > 0 ? 1 : 0)];
                const theirs = dx ? [cornerLevel(nb, dx > 0 ? 0 : 1, 0), cornerLevel(nb, dx > 0 ? 0 : 1, 1)] : [cornerLevel(nb, 0, dz > 0 ? 0 : 1), cornerLevel(nb, 1, dz > 0 ? 0 : 1)];
                if (rise === 0) {
                    if (mine[0] !== mine[1] && isSloped(nb)) joins++;
                    continue;
                }
                // не стыкуется: годится только чистый обрыв (сосед целиком выше или целиком ниже обоих углов)
                const below = theirs[0]! < mine[0]! && theirs[1]! < mine[1]!;
                const above = theirs[0]! > mine[0]! && theirs[1]! > mine[1]!;
                if (!below && !above) ok = false;
            }
            if (ok && joins >= 1) break;
            c.corners = undefined;
        }
    }
}

export function makeMap(): GridMap {
    const hills = noise2(7, 5, 0.42);
    const brush = noise2(31, 4, 0.9);
    const cells: Cell[] = [];
    for (let z = 0; z < MAP_D; z++) {
        // река петляет сверху вниз по карте левее середины
        const riverX = 6 + Math.sin(z * 0.55) * 1.6;
        for (let x = 0; x < MAP_W; x++) {
            const toRiver = Math.abs(x - riverX);
            // холмы выше к правому краю, у реки низина
            const base = 2.2 + hills(x, z) * 2.2 + (x / MAP_W) * 1.6;
            let h = Math.max(1, Math.min(MAX_H, Math.round(base * Math.min(1, toRiver / 3))));
            let terrain: Terrain = 'plain';
            if (toRiver < 0.9) {
                // русло: ногам и гусеницам не перейти, ховер пролетит
                terrain = 'deep';
                h = 0;
            } else if (toRiver < 1.9) {
                // мелкие берега: вброд, но медленно и на виду
                terrain = 'shallow';
                h = 0;
            } else if (brush(x, z) > 0.45) terrain = 'rough';
            cells.push({ x, z, h, terrain });
        }
    }
    const map = new GridMap(MAP_W, MAP_D, cells);
    // брод через реку (мелководье поперёк русла) и дорога от него вправо: по ней удобно ходить, рядом подъёмы на холмы
    const fordZ = 7;
    for (let x = 0; x < MAP_W; x++) {
        const c = map.at(x, fordZ)!;
        if (c.terrain === 'deep') c.terrain = 'shallow';
        else if (c.terrain !== 'shallow') c.terrain = 'road';
    }
    // дорога не карабкается отвесно: сглаживаем перепады вдоль неё до одной ступени
    for (let x = 1; x < MAP_W; x++) {
        const a = map.at(x - 1, fordZ)!;
        const b = map.at(x, fordZ)!;
        if (b.h - a.h > 1) b.h = a.h + 1;
        if (a.h - b.h > 1) b.h = a.h - 1;
    }
    placeRamps(map, fordZ);
    placeCorners(map);
    // обломок стены на холме: глухие блоки на два уровня выше земли, сквозь них не пройти и не выстрелить
    for (const [x, z] of WALLS) {
        const c = map.at(x, z)!;
        c.terrain = 'wall';
        c.h = Math.min(MAX_H + 2, c.h + 2);
    }
    return map;
}
