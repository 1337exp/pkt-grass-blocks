import { describe, expect, it } from 'vitest';
import { GridMap, openGround, pathTo, routes, type Cell } from '@shared/map';

function row(): GridMap {
    const cells: Cell[] = [0, 1, 2].map((x) => ({ x, z: 0, h: 1, terrain: 'plain' as const }));
    cells[1]!.terrain = 'wall';
    return new GridMap(3, 1, cells);
}

describe('ход по карте', () => {
    it('ноги не проходят стену и не находят путь за неё', () => {
        const map = row();
        const reach = routes(map, { x: 0, z: 0 }, { chassis: 'legs', move: 4, up: 1, down: 1 }, openGround);
        expect(reach.stops.has(map.index(2, 0))).toBe(false);
        expect(pathTo(map, reach, map.index(2, 0))).toEqual([]);
    });
});
