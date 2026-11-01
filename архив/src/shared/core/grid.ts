// Логика клеточной карты без графики: клетки с высотой и типом местности, радиус хода и путь. Движок (Three.js или любой другой)
// только рисует то, что посчитано здесь, поэтому модуль можно перенести куда угодно и проверять тестами.
//
// Правила хода (по мотивам Front Mission, см. TERRAIN.md): соседи по четырём сторонам; шаг стоит цену местности клетки, куда
// шагаем, для шасси юнита, плюс по очку за каждый уровень перепада вверх или вниз (по склону перепада нет, см. stepRise); подняться можно не выше `up` уровней за шаг,
// спуститься не ниже `down` (гусеницы не берут больше одного уровня, как бы ни были хороши). Кто мешает, решает правило хода
// (Occupancy): сквозь клетку не пройти (`blocks`) или на неё не встать (`occupied`); в игре любой другой мех — и то и другое.
// Вертолёт (шасси `air`) летает над рельефом: цена шага 1 везде, перепад высоты и местность не мешают (ENTITIES.md, решение 2).

/** Шасси юнита: ноги, гусеницы, ховер, воздух (вертолёт). От него цена местности и предел перепада. */
export type Chassis = 'legs' | 'tracks' | 'hover' | 'air';

export type Terrain = 'plain' | 'road' | 'rough' | 'shallow' | 'deep' | 'wall';

export interface TerrainInfo {
    /** Цена шага на клетку по шасси; null: туда нельзя. */
    cost: Record<Chassis, number | null>;
    /** Поправка к уклонению того, кто стоит на клетке, в процентах (плюс прячет, минус открывает). */
    cover: number;
    /** Перекрывает ли клетка выстрел сквозь себя. */
    blocksFire: boolean;
}

/** Стартовые значения, подбираются в игре (см. таблицу в TERRAIN.md). */
export const TERRAIN: Record<Terrain, TerrainInfo> = {
    plain: { cost: { legs: 1, tracks: 1, hover: 1, air: 1 }, cover: 0, blocksFire: false },
    road: { cost: { legs: 1, tracks: 1, hover: 1, air: 1 }, cover: -5, blocksFire: false },
    rough: { cost: { legs: 2, tracks: 3, hover: 2, air: 1 }, cover: 15, blocksFire: false },
    shallow: { cost: { legs: 2, tracks: 2, hover: 1, air: 1 }, cover: -10, blocksFire: false },
    deep: { cost: { legs: null, tracks: null, hover: 1, air: 1 }, cover: -10, blocksFire: false },
    wall: { cost: { legs: null, tracks: null, hover: null, air: 1 }, cover: 0, blocksFire: true },
};

/** Вода (мелкая или глубокая): для вида и эффектов, на правила хода не влияет. */
export const isWater = (t: Terrain): boolean => t === 'shallow' || t === 'deep';

/** Гусеницы не берут перепад больше одного уровня за шаг (как в серии FM). */
const TRACKS_MAX_STEP = 1;

/** Направление по сетке: единичный шаг по x или по z. */
export interface Dir {
    dx: -1 | 0 | 1;
    dz: -1 | 0 | 1;
}

/**
 * Подъёмы углов клетки над `h`, по уровням (0 или 1), в порядке: (x−, z−), (x+, z−), (x+, z+), (x−, z+). Как карта высот в FM3 или
 * FFT: два соседних поднятых угла — пандус, один — внешний угловой склон, три — внутренний, крест-накрест — седло.
 */
export type Corners = [number, number, number, number];

export interface Cell {
    x: number;
    z: number;
    /** Уровень высоты (целый, 0 это уровень воды). У склона это нижние углы. */
    h: number;
    terrain: Terrain;
    /** Склон: подъёмы углов (см. Corners). Нет — клетка ровная. */
    corners?: Corners;
}

/** Номер угла (ix, iz: 0 у меньшей координаты, 1 у большей) в Corners. */
export const cornerIndex = (ix: number, iz: number): number => (iz ? (ix ? 2 : 3) : ix ? 1 : 0);

/** Высота угла клетки в уровнях. */
export function cornerLevel(c: Cell, ix: number, iz: number): number {
    return c.h + (c.corners?.[cornerIndex(ix, iz)] ?? 0);
}

/** Есть ли у клетки наклон. */
export const isSloped = (c: Cell): boolean => !!c.corners?.some((v) => v !== 0);

/** Подъёмы углов для обычного пандуса, поднимающегося в сторону `d` (подняты два угла этой стороны). */
export function rampCorners(d: Dir): Corners {
    const up = (ix: number, iz: number): number => ((d.dx && (ix ? 1 : -1) === d.dx) || (d.dz && (iz ? 1 : -1) === d.dz) ? 1 : 0);
    return [up(0, 0), up(1, 0), up(1, 1), up(0, 1)];
}

/**
 * По какой диагонали клетка складывается на два треугольника: 'a' — через углы (x−, z−) и (x+, z+), 'b' — через другие два. Если
 * один угол выбивается из трёх (угловой склон), диагональ идёт мимо него: у этого угла крутой треугольник, остальная клетка ровная,
 * как в FM3. Иначе (ровно, пандус, седло) — 'a'.
 */
export function foldDiagonal(c: Cell): 'a' | 'b' {
    const k = c.corners;
    if (!k) return 'a';
    for (let i = 0; i < 4; i++) {
        const others = k.filter((_, j) => j !== i);
        if (others.every((v) => v === others[0]) && k[i] !== others[0]) return i % 2 === 0 ? 'b' : 'a';
    }
    return 'a';
}

/** Углы края клетки, обращённого в сторону (dx, dz): пары (ix, iz). */
function sideCorners(dx: number, dz: number): [number, number][] {
    if (dx) return [[dx > 0 ? 1 : 0, 0], [dx > 0 ? 1 : 0, 1]];
    return [[0, dz > 0 ? 1 : 0], [1, dz > 0 ? 1 : 0]];
}

/**
 * Перепад шага из `a` в соседнюю `b` в уровнях (плюс: вверх). Сравниваются общие углы: сошлись оба — шаг ровный (так склоны
 * соединяют уровни без ступенек); нет — перепад по средней высоте края, округлённый от нуля (наклонный бок у ровной клетки даёт
 * ступеньку в уровень).
 */
export function stepRise(a: Cell, b: Cell): number {
    const dx = Math.sign(b.x - a.x);
    const dz = Math.sign(b.z - a.z);
    const own = sideCorners(dx, dz).map(([ix, iz]) => cornerLevel(a, ix, iz));
    // у соседа те же точки: по оси шага индекс угла с другой стороны
    const their = sideCorners(dx, dz).map(([ix, iz]) => cornerLevel(b, dx ? 1 - ix : ix, dz ? 1 - iz : iz));
    if (own[0] === their[0] && own[1] === their[1]) return 0;
    const mid = (their[0]! + their[1]!) / 2 - (own[0]! + own[1]!) / 2;
    return mid > 0 ? Math.ceil(mid) : Math.floor(mid);
}

export interface Pos {
    x: number;
    z: number;
}

export class GridMap {
    constructor(
        readonly w: number,
        readonly d: number,
        /** Клетки построчно: индекс x + z * w. */
        readonly cells: Cell[],
    ) {
        if (cells.length !== w * d) throw new Error(`карта ${w}×${d} ждёт ${w * d} клеток, пришло ${cells.length}`);
    }

    index(x: number, z: number): number {
        return x + z * this.w;
    }

    inside(x: number, z: number): boolean {
        return x >= 0 && z >= 0 && x < this.w && z < this.d;
    }

    at(x: number, z: number): Cell | undefined {
        return this.inside(x, z) ? this.cells[this.index(x, z)] : undefined;
    }

    /** Соседи по четырём сторонам (без диагоналей). */
    neighbors(c: Pos): Cell[] {
        const out: Cell[] = [];
        for (const [dx, dz] of STEPS) {
            const n = this.at(c.x + dx, c.z + dz);
            if (n) out.push(n);
        }
        return out;
    }
}

const STEPS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
] as const;

/** Чем ходит юнит: шасси, очки хода, на сколько уровней может подняться и спуститься за один шаг. */
export interface Mover {
    chassis: Chassis;
    move: number;
    up: number;
    down: number;
}

/** Кто где стоит: `blocks` — сквозь клетку не пройти, `occupied` — на клетке кто-то есть (вставать нельзя). */
export interface Occupancy {
    blocks(x: number, z: number): boolean;
    occupied(x: number, z: number): boolean;
}

export interface Reach {
    /** Сколько очков хода стоит добраться до клетки (по индексу), для всех клеток, куда можно пройти. */
    cost: Map<number, number>;
    /** Откуда пришли в клетку на самом дешёвом пути. */
    prev: Map<number, number>;
    /** Клетки, где можно закончить ход (без стартовой и занятых). */
    stops: Set<number>;
    /** Путь до каждой клетки (индексы от старта): при лимите шагов цепочка по `prev` не годится, путь берём отсюда. */
    paths: Map<number, number[]>;
}

/** Летит ли юнит (вертолёт): над рельефом, без перепада высоты; сквозь него проходят и под ним проходят, но на его клетку не встать. */
export const flies = (mover: Mover): boolean => mover.chassis === 'air';

/**
 * Высота полёта в уровнях над клеткой, под которой вертолёт (по записям FM3: над землёй базовой 5 клеток, и по склону он опускается
 * на уровень ванзера). Относительная, прибавка к текущей высоте земли: над возвышенностью выше, над низиной ниже. Предела карты
 * (потолка) нет: сколько у карты максимум уровней, решает дизайнер. От этих «невидимых блоков» считаются прицел, линия огня,
 * ближний бой и штраф высоты: цель в воздухе выше стрелка на уровень земли под ней плюс эту высоту.
 */
/** Пять уровней по записям FM3 плюс сегмент (полуровня): вертолёты не на одной высоте с соседними фигурами, иначе в воздухе их шкалы и тела накладывались бы на чужие клетки. */
export const AIR_ALTITUDE = 5.5;

/** На сколько уровней над своей клеткой находится юнит: вертолёт на `AIR_ALTITUDE`, остальные на земле. */
export const altitudeOf = (mover: Mover): number => (flies(mover) ? AIR_ALTITUDE : 0);

/** Цена шага из `a` в соседнюю `b` для юнита: местность плюс очко за уровень перепада; null, если шагнуть нельзя. */
export function stepCost(a: Cell, b: Cell, mover: Mover): number | null {
    const base = TERRAIN[b.terrain].cost[mover.chassis];
    if (base === null) return null;
    if (flies(mover)) return base; // рельеф внизу: перепад высоты не считается
    const dh = stepRise(a, b);
    const cap = mover.chassis === 'tracks' ? TRACKS_MAX_STEP : Infinity;
    if (dh > Math.min(mover.up, cap) || -dh > Math.min(mover.down, cap)) return null;
    return base + Math.abs(dh);
}

/** Пределы хода: цена пути (очки действия; по умолчанию `mover.move`) и число шагов (лимит ног; по умолчанию без лимита). */
export interface ReachOptions {
    budget?: number;
    maxSteps?: number;
}

/**
 * Радиус хода из `from`: Дейкстра по цене шага в пределах `opts.budget` (по умолчанию `mover.move`). Если задан `opts.maxSteps`
 * (физический лимит ног в клетках: во FM3 у тяжёлых ног 3, у лёгких 5–6, сколько бы ни было очков действия), состояние — клетка
 * вместе с числом пройденных шагов: клетку можно взять и дорогим путём покороче, и дешёвым подлиннее, если шагов хватает. Карта
 * маленькая, поэтому очередь простым массивом.
 */
export function reachable(map: GridMap, from: Pos, mover: Mover, occ: Occupancy, opts: ReachOptions = {}): Reach {
    const budget = opts.budget ?? mover.move;
    const maxSteps = opts.maxSteps ?? Infinity;
    const stride = Number.isFinite(maxSteps) ? maxSteps + 1 : 1;
    const start = map.index(from.x, from.z);
    // состояние = клетка × число шагов (без лимита шагов оно одно на клетку)
    const key = (ci: number, steps: number): number => ci * stride + (Number.isFinite(maxSteps) ? steps : 0);
    const cost = new Map<number, number>([[key(start, 0), 0]]);
    const prev = new Map<number, number>();
    const done = new Set<number>();
    const queue: number[] = [key(start, 0)];
    while (queue.length) {
        // берём самое дешёвое состояние из очереди
        let bi = 0;
        for (let i = 1; i < queue.length; i++) if (cost.get(queue[i]!)! < cost.get(queue[bi]!)!) bi = i;
        const k = queue.splice(bi, 1)[0]!;
        if (done.has(k)) continue;
        done.add(k);
        const ci = Math.floor(k / stride);
        const steps = k % stride;
        if (Number.isFinite(maxSteps) && steps >= maxSteps) continue; // ноги больше не идут
        const c = map.cells[ci]!;
        for (const n of map.neighbors(c)) {
            const step = stepCost(c, n, mover);
            if (step === null || occ.blocks(n.x, n.z)) continue;
            const nk = key(map.index(n.x, n.z), steps + 1);
            const nc = cost.get(k)! + step;
            if (nc > budget || nc >= (cost.get(nk) ?? Infinity)) continue;
            cost.set(nk, nc);
            prev.set(nk, k);
            queue.push(nk);
        }
    }
    // по клетке: самое дешёвое состояние и путь к нему (по цепочке состояний)
    const best = new Map<number, number>();
    const bestKey = new Map<number, number>();
    for (const [k, c] of cost) {
        const ci = Math.floor(k / stride);
        if (c < (best.get(ci) ?? Infinity)) {
            best.set(ci, c);
            bestKey.set(ci, k);
        }
    }
    const paths = new Map<number, number[]>();
    for (const [ci, k0] of bestKey) {
        const chain: number[] = [];
        for (let k: number | undefined = k0; k !== undefined; k = prev.get(k)) chain.push(Math.floor(k / stride));
        paths.set(ci, chain.reverse());
    }
    const prevCell = new Map<number, number>();
    for (const [ci, path] of paths) if (path.length > 1) prevCell.set(ci, path[path.length - 2]!);
    const stops = new Set<number>();
    for (const i of best.keys()) {
        const c = map.cells[i]!;
        if (i !== start && !occ.occupied(c.x, c.z)) stops.add(i);
    }
    return { cost: best, prev: prevCell, stops, paths };
}

/** Путь от старта до клетки `to` (по индексу) включительно с обоих концов; пустой, если туда не добраться. */
export function pathTo(map: GridMap, reach: Reach, to: number): Cell[] {
    if (!reach.cost.has(to)) return [];
    const path = reach.paths.get(to);
    if (path) return path.map((i) => map.cells[i]!);
    const out: Cell[] = [];
    let i: number | undefined = to;
    while (i !== undefined) {
        out.push(map.cells[i]!);
        i = reach.prev.get(i);
    }
    return out.reverse();
}
