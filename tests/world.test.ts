import { describe, expect, it } from 'vitest';
import { eraseBlock, fillBlock, fillRect, putProp, setCorners, shiftTop } from '@core/ops';
import { rampCorners, stepRise } from '@core/slope';
import { createReadyWorld, occupied, spansAt, WorldError } from '@core/world';
import { floats, links, surfaces, walkCaps } from '@core/walk';
import { formatWorld, parseWorld } from '@core/document';
import { islandWorld } from '@core/island';

const ready = () => createReadyWorld('Тест');

describe('дыры и пролёты', () => {
    it('снятый блок посередине делит колонну, последний блок колонны оставляет дыру', () => {
        let world = fillBlock(ready(), 0, 0, 0, 'rock');
        world = fillBlock(world, 0, 0, 1, 'rock');
        world = fillBlock(world, 0, 0, 2, 'rock');
        world = eraseBlock(world, 0, 0, 1);
        expect(spansAt(world, 0, 0).map((s) => [s.y0, s.y1])).toEqual([[0, 1], [2, 3]]);
        expect(occupied(world, 0, 1, 0)).toBe(false);
        world = eraseBlock(world, 0, 0, 0);
        world = eraseBlock(world, 0, 0, 2);
        expect(spansAt(world, 0, 0)).toEqual([]);
        expect(world.columns.has('0,0')).toBe(false);
    });

    it('настил не стоит на полу и стыкуется с берегами без перепада', () => {
        let world = fillRect(ready(), 0, 0, 0, 0, 0, 3, 'grass');
        world = fillRect(world, 1, 0, 1, 0, 2, 3, 'wood');
        world = fillRect(world, 2, 0, 2, 0, 0, 3, 'grass');
        expect(floats(world, 1, 0)).toBe(true);
        expect(occupied(world, 1, 0, 0)).toBe(false);
        expect(occupied(world, 1, 2, 0)).toBe(true);
        const deck = walkCaps(world).find((c) => c.x === 1);
        const shore = walkCaps(world).find((c) => c.x === 0);
        expect(deck && shore && links(world, shore).some((l) => l.to.x === 1 && l.rise === 0)).toBe(true);
    });

    it('между островами без колонны шага нет, вода шага не даёт', () => {
        const world = islandWorld();
        expect(spansAt(world, 0, 5)).toEqual([]);
        const south = walkCaps(world).find((c) => c.x === 0 && c.z === 4);
        expect(south && links(world, south).some((l) => l.to.z === 5)).toBe(false);
        const bank = walkCaps(world).find((c) => c.x === 3 && c.z === 0);
        expect(bank && links(world, bank).some((l) => l.to.x === 4)).toBe(false);
        expect(surfaces(world).some((c) => c.material === 'water' && c.liquid && !c.standable)).toBe(true);
    });

    it('два пролёта: ход берёт верхний, нижний остаётся в списке площадок', () => {
        let world = fillRect(ready(), 0, 0, 0, 0, 0, 1, 'water');
        world = fillRect(world, 0, 0, 0, 0, 6, 8, 'wood');
        const tops = walkCaps(world);
        expect(tops).toHaveLength(1);
        expect(tops[0]).toMatchObject({ y: 8, material: 'wood' });
        expect(surfaces(world).map((c) => c.y).sort((a, b) => a - b)).toEqual([1, 8]);
    });
});

describe('пандус', () => {
    it('вдоль пандуса перепад нулевой и снизу, и сверху', () => {
        let world = fillRect(ready(), 0, 0, 2, 0, 0, 1, 'grass');
        world = shiftTop(world, 2, 0, 1);
        world = setCorners(world, 1, 0, 0, rampCorners({ dx: 1, dz: 0 }));
        const caps = walkCaps(world).sort((a, b) => a.x - b.x);
        expect(stepRise(caps[0]!, caps[1]!)).toBe(0);
        expect(stepRise(caps[1]!, caps[2]!)).toBe(0);
        expect(stepRise(caps[2]!, caps[1]!)).toBe(0);
    });

    it('на образецном утёсе пандус встречается с камнем', () => {
        const world = islandWorld();
        const ramp = walkCaps(world).find((c) => c.x === 8 && c.z === 2);
        const rock = walkCaps(world).find((c) => c.x === 9 && c.z === 2);
        expect(ramp && rock && stepRise(ramp, rock)).toBe(0);
    });
});

describe('файл', () => {
    it('образец переживает запись и чтение теми же байтами', () => {
        const text = formatWorld(islandWorld());
        expect(formatWorld(parseWorld(JSON.parse(text)))).toBe(text);
        expect(text).toContain('"4,1 2:3 wood"');
        expect(text).toContain('grass/0110');
    });

    it('пролёт пишется одной строкой, второй пролёт отделён чертой', () => {
        let world = fillRect(ready(), 3, 0, 3, 0, 0, 1, 'water');
        world = fillRect(world, 3, 0, 3, 0, 6, 8, 'wood');
        world = setCorners(world, 3, 0, 6, [1, 1, 0, 0]);
        const text = formatWorld(world);
        expect(text).toContain('\n        "3,0 0:1 water | 6:8 wood/1100"\n');
    });

    it('ломаный файл объясняет, что не так', () => {
        const overlap = JSON.parse(formatWorld(ready())) as { columns: string[] };
        overlap.columns = ['3,1 0:2 grass | 1:4 rock'];
        expect(() => parseWorld(overlap)).toThrow(WorldError);
        expect(() => parseWorld(overlap)).toThrow(/пересекаются/);
        const twice = JSON.parse(formatWorld(islandWorld())) as { columns: string[] };
        twice.columns.push('3,1 0:1 grass');
        expect(() => parseWorld(twice)).toThrow(/записана дважды/);
    });

    it('предмет едет вместе с верхней площадкой', () => {
        let world = fillRect(ready(), 1, 1, 1, 1, 0, 2, 'grass');
        world = putProp(world, { id: 'tree-1', type: 'tree', x: 1, z: 1, y: 2, yaw: 0 });
        world = shiftTop(world, 1, 1, 1);
        expect(world.props[0]).toMatchObject({ y: 3 });
        world = eraseBlock(world, 1, 1, 2);
        expect(world.props).toEqual([]);
    });
});
