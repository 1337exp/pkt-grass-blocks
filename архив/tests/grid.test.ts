import { describe, expect, it } from 'vitest';
import { entityType } from '@shared/core/catalog';
import { type Cell, foldDiagonal, GridMap, type Mover, type Occupancy, pathTo, rampCorners, reachable, stepCost, stepRise, type Terrain } from '@shared/core/grid';

/**
 * Карта из строк: цифра это высота. Вторая (необязательная) раскладка — местность: . равнина, = дорога, r бурелом,
 * s мелководье, ~ глубокая вода, # стена.
 */
function mapOf(rows: string[], terrain: string[] = []): GridMap {
    const KIND: Record<string, Terrain> = { '.': 'plain', '=': 'road', r: 'rough', s: 'shallow', '~': 'deep', '#': 'wall' };
    const cells: Cell[] = [];
    rows.forEach((row, z) =>
        [...row].forEach((ch, x) => {
            cells.push({ x, z, h: Number(ch), terrain: KIND[terrain[z]?.[x] ?? '.']! });
        }),
    );
    return new GridMap(rows[0]!.length, rows.length, cells);
}

const free: Occupancy = { blocks: () => false, occupied: () => false };
const legs = (move = 2, up = 1, down = 2): Mover => ({ chassis: 'legs', move, up, down });

describe('радиус хода', () => {
    it('на ровном поле ромб: 2 шага дают 12 клеток вокруг', () => {
        const map = mapOf(['11111', '11111', '11111', '11111', '11111']);
        const r = reachable(map, { x: 2, z: 2 }, legs(), free);
        expect(r.stops.size).toBe(12);
        expect(r.stops.has(map.index(2, 2))).toBe(false); // стартовая клетка не цель
        expect(r.stops.has(map.index(1, 1))).toBe(true); // диагональ = два шага
        expect(r.stops.has(map.index(0, 0))).toBe(false); // четыре шага
    });

    it('подъём выше up не берётся, спуск в пределах down берётся', () => {
        const map = mapOf(['131']);
        expect(reachable(map, { x: 0, z: 0 }, legs(4), free).stops.size).toBe(0); // 1 → 3: две ступени вверх
        expect(reachable(map, { x: 1, z: 0 }, legs(4), free).stops.size).toBe(2); // 3 → 1: две вниз, можно
    });

    it('механизм: «не встать» и «не пройти» — разные запреты (в игре любой мех и то и другое)', () => {
        const map = mapOf(['1111']);
        const ally: Occupancy = { blocks: () => false, occupied: (x) => x === 1 };
        const ra = reachable(map, { x: 0, z: 0 }, legs(), ally);
        expect(ra.stops.has(map.index(1, 0))).toBe(false);
        expect(ra.stops.has(map.index(2, 0))).toBe(true);
        const enemy: Occupancy = { blocks: (x) => x === 1, occupied: (x) => x === 1 };
        expect(reachable(map, { x: 0, z: 0 }, legs(), enemy).stops.size).toBe(0);
    });

    it('путь самый дешёвый и идёт от старта к цели', () => {
        // напрямую по бурелому 2 + 2 + 2 + 1 = 7, в обход по равнине 6
        const map = mapOf(['11111', '11111'], ['.rrr.', '.....']);
        const r = reachable(map, { x: 0, z: 0 }, legs(10), free);
        const to = map.index(4, 0);
        expect(r.cost.get(to)).toBe(6);
        expect(pathTo(map, r, to).map((c) => [c.x, c.z])).toEqual([
            [0, 0],
            [0, 1],
            [1, 1],
            [2, 1],
            [3, 1],
            [4, 1],
            [4, 0],
        ]);
        expect(pathTo(map, r, map.index(9, 9))).toEqual([]);
    });
});

describe('цена шага', () => {
    it('каждый уровень перепада стоит очко хода, вверх и вниз', () => {
        const map = mapOf(['123']);
        const [a, b, c] = map.cells as [Cell, Cell, Cell];
        expect(stepCost(a, b, legs(9, 3, 3))).toBe(2); // равнина 1 + подъём 1
        expect(stepCost(c, b, legs(9, 3, 3))).toBe(2); // равнина 1 + спуск 1
        expect(stepCost(a, { ...c, x: 1 }, legs(9, 3, 3))).toBe(3); // перепад в два уровня
    });

    it('гусеницы не берут перепад больше одного уровня, даже если up позволяет', () => {
        const map = mapOf(['13']);
        const [low, high] = map.cells as [Cell, Cell];
        expect(stepCost(low, high, { chassis: 'tracks', move: 9, up: 3, down: 3 })).toBeNull();
        expect(stepCost(low, high, legs(9, 3, 3))).toBe(3);
    });

    it('шасси по-разному платят за местность', () => {
        const map = mapOf(['11'], ['.r']);
        const [a, rough] = map.cells as [Cell, Cell];
        expect(stepCost(a, rough, legs())).toBe(2);
        expect(stepCost(a, rough, { chassis: 'tracks', move: 9, up: 1, down: 1 })).toBe(3);
        expect(stepCost(a, rough, { chassis: 'hover', move: 9, up: 1, down: 1 })).toBe(2);
    });
});

describe('вода и стены', () => {
    it('мелководье проходимо для всех, глубокая вода только для ховера', () => {
        // равнина, мелководье, глубокая, равнина; всё на одной высоте, чтобы считать только местность
        const map = mapOf(['1111'], ['.s~.']);
        const shallow = map.index(1, 0);
        const deep = map.index(2, 0);
        const far = map.index(3, 0);
        const onLegs = reachable(map, { x: 0, z: 0 }, legs(9), free);
        expect(onLegs.stops.has(shallow)).toBe(true);
        expect(onLegs.stops.has(deep)).toBe(false);
        expect(onLegs.stops.has(far)).toBe(false); // за глубокой водой не обойти
        const onHover = reachable(map, { x: 0, z: 0 }, { chassis: 'hover', move: 9, up: 1, down: 1 }, free);
        expect(onHover.cost.get(shallow)).toBe(1);
        expect(onHover.cost.get(deep)).toBe(2);
        expect(onHover.stops.has(far)).toBe(true);
    });

    it('сквозь стену не пройти никому, даже ховеру', () => {
        const map = mapOf(['111'], ['.#.']);
        for (const chassis of ['legs', 'tracks', 'hover'] as const) {
            expect(reachable(map, { x: 0, z: 0 }, { chassis, move: 9, up: 9, down: 9 }, free).stops.size).toBe(0);
        }
    });
});

describe('вертолёт', () => {
    const heli = (move = 9): Mover => ({ chassis: 'air', move, up: 9, down: 9 });

    it('летит над стеной, глубокой водой и обрывом: шаг стоит 1, перепад не считается', () => {
        const map = mapOf(['1911'], ['.#~.']);
        const r = reachable(map, { x: 0, z: 0 }, heli(), free);
        expect(r.cost.get(map.index(1, 0))).toBe(1); // стена на уровне 9: пешему не взять и в два счёта
        expect(r.cost.get(map.index(2, 0))).toBe(2);
        expect(r.cost.get(map.index(3, 0))).toBe(3);
        expect(reachable(map, { x: 0, z: 0 }, legs(9), free).stops.size).toBe(0);
    });

    it('идёт по цене шага, а не местности: бурелом тоже 1', () => {
        const map = mapOf(['111'], ['.rr']);
        expect(reachable(map, { x: 0, z: 0 }, heli(), free).cost.get(map.index(2, 0))).toBe(2);
    });

    it('под вертолётом пройти можно, встать нельзя; пешему на его клетке стоять нельзя, а вертолёт над мехом тоже не встанет', () => {
        const map = mapOf(['1111']);
        // клетка 1 занята вертолётом: не `blocks`, но `occupied`
        const underHeli: Occupancy = { blocks: () => false, occupied: (x) => x === 1 };
        const r = reachable(map, { x: 0, z: 0 }, legs(9), underHeli);
        expect(r.stops.has(map.index(1, 0))).toBe(false); // встать нельзя
        expect(r.stops.has(map.index(2, 0))).toBe(true); // а пройти насквозь можно
        // сам вертолёт пролетает над всем, но останавливается только на пустых клетках
        const overAll: Occupancy = { blocks: () => false, occupied: (x) => x === 1 || x === 2 };
        const h = reachable(map, { x: 0, z: 0 }, heli(), overAll);
        expect([1, 2, 3].map((x) => h.stops.has(map.index(x, 0)))).toEqual([false, false, true]);
    });
});

describe('лимит ног и очки действия', () => {
    it('ноги ходят не больше своего лимита шагов, сколько бы ни было очков', () => {
        const map = mapOf(['11111111']);
        const r = reachable(map, { x: 0, z: 0 }, legs(3), free, { budget: 12, maxSteps: 3 });
        expect([...r.stops].sort((a, b) => a - b)).toEqual([1, 2, 3]);
    });

    it('очков меньше лимита ног: ограничивают они', () => {
        const map = mapOf(['11111111']);
        const r = reachable(map, { x: 0, z: 0 }, legs(5), free, { budget: 2, maxSteps: 5 });
        expect([...r.stops].sort((a, b) => a - b)).toEqual([1, 2]);
    });

    it('цена шага берётся из очков, шагов считается по числу клеток: бурелом стоит 2 очка, но один шаг', () => {
        const map = mapOf(['11111'], ['.rr..']);
        const r = reachable(map, { x: 0, z: 0 }, legs(3), free, { budget: 6, maxSteps: 3 });
        expect(r.cost.get(3)).toBe(5); // 2 + 2 + 1
        expect(r.stops.has(4)).toBe(false); // четвёртый шаг ноги не сделают, хотя очков остался один
    });

    it('клетку берут и дорогим коротким путём, если дешёвый в обход не укладывается в шаги', () => {
        // (0,0) → (2,0): напрямую бурелом (1,0) 2 + равнина 1 = 3 за два шага; в обход четыре шага по равнине = 4
        const map = mapOf(['111', '111'], ['.r.', '...']);
        const r = reachable(map, { x: 0, z: 0 }, legs(2), free, { budget: 4, maxSteps: 2 });
        expect(r.cost.get(2)).toBe(3);
        expect(pathTo(map, r, 2).map((c) => [c.x, c.z])).toEqual([
            [0, 0],
            [1, 0],
            [2, 0],
        ]);
    });

    it('без лимита шагов всё по-старому: ход — это цена пути', () => {
        const map = mapOf(['11111111']);
        expect(reachable(map, { x: 0, z: 0 }, legs(3), free).stops.size).toBe(3);
    });
});

describe('пандусы', () => {
    // ряд: равнина на 1, пандус с 1 вверх по +x, площадка на 2
    const row = (): GridMap => {
        const map = mapOf(['112']);
        map.at(1, 0)!.corners = rampCorners({ dx: 1, dz: 0 });
        return map;
    };

    it('вдоль пандуса шаг ровный: без очка за перепад ни снизу, ни сверху', () => {
        const map = row();
        const [low, ramp, high] = map.cells as [Cell, Cell, Cell];
        expect(stepRise(low, ramp)).toBe(0);
        expect(stepRise(ramp, high)).toBe(0);
        expect(stepRise(high, ramp)).toBe(0);
        expect(stepCost(low, ramp, legs())).toBe(1);
        expect(stepCost(ramp, high, legs())).toBe(1);
    });

    it('без пандуса тот же подъём стоит очко сверху', () => {
        const map = mapOf(['112']);
        const [, mid, high] = map.cells as [Cell, Cell, Cell];
        expect(stepCost(mid, high, legs())).toBe(2);
    });

    it('поперёк пандуса — ступенька в уровень, а два пандуса бок о бок — широкий въезд', () => {
        const map = mapOf(['11', '11']);
        map.at(0, 0)!.corners = rampCorners({ dx: 0, dz: 1 });
        const ramp = map.at(0, 0)!;
        const side = map.at(1, 0)!;
        expect(Math.abs(stepRise(side, ramp))).toBe(1);
        side.corners = rampCorners({ dx: 0, dz: 1 });
        expect(stepRise(side, ramp)).toBe(0);
    });

    it('гусеницы заезжают на площадку в два уровня по двум пандусам подряд', () => {
        // 1, пандус 1→2, пандус 2→3, площадка 3: без пандусов это две ступени, по одной гусеницам можно, но дорого
        const map = mapOf(['1123']);
        map.at(1, 0)!.corners = rampCorners({ dx: 1, dz: 0 });
        map.at(2, 0)!.corners = rampCorners({ dx: 1, dz: 0 });
        const tracks: Mover = { chassis: 'tracks', move: 9, up: 1, down: 1 };
        const r = reachable(map, { x: 0, z: 0 }, tracks, free);
        expect(r.cost.get(map.index(3, 0))).toBe(3); // три ровных шага
    });
});

describe('склоны по углам', () => {
    it('пандус — это два поднятых угла своей стороны', () => {
        expect(rampCorners({ dx: 1, dz: 0 })).toEqual([0, 1, 1, 0]);
        expect(rampCorners({ dx: 0, dz: -1 })).toEqual([1, 1, 0, 0]);
    });

    it('угловой склон без ступенек соединяет два пандуса, сходящихся углом', () => {
        // площадка 2 в правом нижнем углу, пандусы к ней слева (вверх по +x) и сверху (вверх по +z), в углу — один поднятый угол
        const map = mapOf(['111', '112', '122'].map((r) => r));
        map.at(1, 1)!.h = 1;
        const corner = map.at(1, 1)!;
        corner.corners = [0, 0, 1, 0]; // поднят угол (x+, z+), смотрящий на площадку
        map.at(2, 1)!.h = 1;
        map.at(2, 1)!.corners = rampCorners({ dx: 0, dz: 1 }); // справа от угла: пандус к площадке вниз по z
        map.at(1, 2)!.h = 1;
        map.at(1, 2)!.corners = rampCorners({ dx: 1, dz: 0 }); // под углом: пандус к площадке по x
        expect(stepRise(corner, map.at(2, 1)!)).toBe(0);
        expect(stepRise(corner, map.at(1, 2)!)).toBe(0);
        expect(stepRise(corner, map.at(0, 1)!)).toBe(0); // ровная сторона к ровной клетке
    });

    it('угловой склон складывается по диагонали мимо выбившегося угла', () => {
        const c: Cell = { x: 0, z: 0, h: 1, terrain: 'plain', corners: [0, 0, 1, 0] };
        expect(foldDiagonal(c)).toBe('b'); // угол 2 (x+, z+) выбился: диагональ через углы 1 и 3
        c.corners = [1, 1, 1, 0]; // внутренний угол: выбился угол 3 (опущен)
        expect(foldDiagonal(c)).toBe('a');
        c.corners = rampCorners({ dx: 1, dz: 0 });
        expect(foldDiagonal(c)).toBe('a'); // пандус плоский, диагональ любая
    });
});

describe('перепад хода у меха из каталога', () => {
    it('мех лезет и спрыгивает не больше чем на уровень: обрыв в два уровня не пройти ни вверх, ни вниз', () => {
        const mech = entityType('mech')!.mover!;
        const map = mapOf(['13', '12']);
        const [low, one, two] = [map.at(0, 0)!, map.at(0, 1)!, map.at(1, 0)!];
        expect(stepCost(low, one, mech)).not.toBeNull(); // 1 → 1 и 1 → 2: уровень
        expect(stepCost(low, two, mech)).toBeNull(); // вверх на два
        expect(stepCost(two, low, mech)).toBeNull(); // вниз на два
    });
});
