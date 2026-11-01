import { describe, expect, it } from 'vitest';
import { makeMap } from '@shared/core/generate';
import { formatMap, MapError, parseMap, toMapFile } from '@shared/core/mapFile';
import type { Entity, UnitSpec } from '@shared/core/entity';

const unit = (over: Partial<UnitSpec> = {}): UnitSpec => ({ type: 'mech', name: 'Тест', team: 'ally', pos: { x: 0, z: 0 }, mover: { chassis: 'legs', move: 4, up: 1, down: 1 }, weapon: 'rifle', hp: 50, ...over });

/** Маленькая карта 3×2 в виде файла, чтобы портить её по одному полю. */
const small = (): Record<string, unknown> => ({
    version: 3,
    name: 'Мини',
    size: [3, 2],
    height: ['224', '222'], // сегменты по полуровня: 2 = уровень 1, 4 = уровень 2
    terrain: ['..#', 's~.'],
    slopes: [{ at: [1, 0], corners: '0110' }],
    entities: [{ type: 'mech', name: 'А', team: 'ally', at: [0, 0], chassis: 'legs', move: 4, up: 1, down: 1, hp: 50 }, { type: 'tree', at: [1, 0] }],
});

describe('файл карты', () => {
    it('карта переживает запись и чтение без потерь', () => {
        const map = makeMap();
        const tree: Entity = { type: 'tree', name: 'дерево', team: 'neutral', pos: { x: 6, z: 3 }, hp: 60 };
        const entities: Entity[] = [unit({ pos: { x: 1, z: 4 } }), unit({ name: 'Б', team: 'enemy', pos: { x: 13, z: 5 } }), tree];
        const text = formatMap(toMapFile('Брод', map, entities));
        const back = parseMap(JSON.parse(text));
        expect(back.name).toBe('Брод');
        expect(back.map.cells).toEqual(map.cells.map((c) => (c.corners?.some((v) => v) ? c : { x: c.x, z: c.z, h: c.h, terrain: c.terrain })));
        expect(back.entities).toEqual(entities);
    });

    it('каждый ряд карты — своя строка файла; у объекта в файле только то, что отличает его от вида', () => {
        const text = formatMap(toMapFile('Мини', parseMap(small()).map, parseMap(small()).entities));
        expect(text).toContain('\n        "224",\n        "222"\n');
        expect(text).toContain('{"type":"tree","at":[1,0]}');
    });

    it('читает местность, высоты, склоны и сущности; объекту недостающее — из каталога', () => {
        const { map, entities } = parseMap(small());
        expect(map.at(2, 0)!.terrain).toBe('wall');
        expect(map.at(1, 1)!.terrain).toBe('deep');
        expect(map.at(2, 0)!.h).toBe(2);
        expect(map.at(1, 0)!.corners).toEqual([0, 1, 1, 0]);
        expect(entities[0]!.pos).toEqual({ x: 0, z: 0 });
        expect(entities[1]).toEqual({ type: 'tree', name: 'дерево', team: 'neutral', pos: { x: 1, z: 0 }, hp: 60 });
    });

    it('высота в сегментах: два сегмента уровень, пол-уровня пишется и читается', () => {
        const { map } = parseMap({ ...small(), height: ['1a3', '0zh'] });
        expect([1, 10, 3].map((v) => v / 2)).toEqual([map.at(0, 0)!.h, map.at(1, 0)!.h, map.at(2, 0)!.h]);
        expect(map.at(1, 1)!.h).toBe(17.5);
        const back = parseMap(JSON.parse(formatMap(toMapFile('Мини', map, [])))).map;
        expect(back.cells.map((c) => c.h)).toEqual(map.cells.map((c) => c.h));
        expect(formatMap(toMapFile('Мини', map, []))).toContain('"1a3"');
    });

    it('старые версии не читаются', () => {
        expect(() => parseMap({ ...small(), version: 2 })).toThrow(/только 3/);
        expect(() => parseMap({ ...small(), version: 1 })).toThrow(MapError);
    });

    it('вертолёт висит над стеной и глубокой водой, мех там не встанет', () => {
        const heli = (at: number[]): object => ({ type: 'heli', name: 'В', team: 'ally', at });
        expect(parseMap({ ...small(), entities: [heli([2, 0])] }).entities[0]).toMatchObject({ type: 'heli', mover: { chassis: 'air', move: 7 }, weapon: 'machinegun' });
        expect(parseMap({ ...small(), entities: [heli([1, 1])] }).entities).toHaveLength(1);
        const mech = (small().entities as object[])[0];
        expect(() => parseMap({ ...small(), entities: [{ ...mech, at: [2, 0] }] })).toThrow(/в стене/);
    });

    it('бонус рук и уклонение бойца читаются и пишутся, плохие значения отвергаются', () => {
        const mech = (small().entities as object[])[0];
        const withStats = parseMap({ ...small(), entities: [{ ...mech, arm: 0.3, evasion: 0.2 }] }).entities[0]!;
        expect(withStats).toMatchObject({ arm: 0.3, evasion: 0.2 });
        const back = parseMap(JSON.parse(formatMap(toMapFile('Мини', parseMap(small()).map, [withStats])))).entities[0]!;
        expect(back).toMatchObject({ arm: 0.3, evasion: 0.2 });
        expect(parseMap(small()).entities[0]).not.toHaveProperty('arm');
        expect(() => parseMap({ ...small(), entities: [{ ...mech, evasion: 0.9 }] })).toThrow(/evasion/);
        expect(() => parseMap({ ...small(), entities: [{ ...mech, arm: -1 }] })).toThrow(/arm/);
    });

    it('объясняет, что не так', () => {
        const broken = (patch: Record<string, unknown>): (() => unknown) => () => parseMap({ ...small(), ...patch });
        const mech = (small().entities as object[])[0];
        expect(broken({ version: 4 })).toThrow(MapError);
        expect(broken({ height: ['224'] })).toThrow(/height: нужно 2 строк/);
        expect(broken({ terrain: ['..?', 's~.'] })).toThrow(/неизвестный символ «\?»/);
        expect(broken({ slopes: [{ at: [9, 9], corners: '0110' }] })).toThrow(/вне карты/);
        expect(broken({ entities: [{ ...mech, at: [2, 0] }] })).toThrow(/в стене/);
        expect(broken({ entities: [{ ...mech, at: [1, 1] }] })).toThrow(/только ховер/);
        expect(broken({ entities: [{ type: 'tree', at: [1, 1] }] })).toThrow(/в глубокой воде/);
        expect(broken({ entities: [mech, { type: 'tree', at: [0, 0] }] })).toThrow(/уже занята/);
        expect(broken({ entities: [{ type: 'ufo', at: [0, 0] }] })).toThrow(/неизвестный вид «ufo»/);
        expect(broken({ entities: [{ type: 'mech', at: [0, 0], team: 'ally' }] })).toThrow(/нет имени/);
        expect(broken({ entities: [{ ...mech, weapon: 'laser' }] })).toThrow(/оружие laser/);
    });
});
