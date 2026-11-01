import { describe, expect, it } from 'vitest';
import { GridMap } from '@shared/core/grid';
import { MAX_LEVEL } from '@shared/core/mapFile';
import { applySlope, brushCells, flattenCell, liftCells, paintCells, restoreCells, setLevel, slopeTarget, snapshotCells } from '@editor/ops';
import { History } from '@editor/history';
import { entityAt, makeEntity, moveEntity, standError } from '@editor/entities';
import type { Entity } from '@shared/core/entity';

const flat = (w: number, d: number, h = 1): GridMap =>
    new GridMap(w, d, Array.from({ length: w * d }, (_, i) => ({ x: i % w, z: Math.floor(i / w), h, terrain: 'plain' as const })));

describe('правки карты', () => {
    it('кисть 3×3 обрезается у края', () => {
        const map = flat(4, 4);
        expect(brushCells(map, map.index(1, 1), 3)).toHaveLength(9);
        expect(brushCells(map, map.index(0, 0), 3).sort((a, b) => a - b)).toEqual([0, 1, 4, 5]);
        expect(brushCells(map, map.index(2, 2), 1)).toEqual([map.index(2, 2)]);
    });

    it('подъём и спуск в пределах 0…MAX_LEVEL, склон не выше него поднятыми углами', () => {
        const map = flat(3, 1);
        map.cells[0]!.h = MAX_LEVEL;
        map.cells[1]!.h = 0;
        map.cells[2]!.h = MAX_LEVEL - 1;
        map.cells[2]!.corners = [0, 1, 1, 0];
        expect(liftCells(map, [0, 1, 2], 1)).toEqual([1]);
        expect(liftCells(map, [0, 1, 2], -1)).toEqual([0, 1, 2]);
        expect(map.cells.map((c) => c.h)).toEqual([MAX_LEVEL - 1, 0, MAX_LEVEL - 2]);
        expect(liftCells(map, [1], -1)).toEqual([]);
    });

    it('сегмент: подъём на полуровня, два сегмента уровень', () => {
        const map = flat(1, 1);
        liftCells(map, [0], 0.5);
        expect(map.cells[0]!.h).toBe(1.5);
        liftCells(map, [0], 0.5);
        expect(map.cells[0]!.h).toBe(2);
        liftCells(map, [0], -0.5);
        expect(map.cells[0]!.h).toBe(1.5);
    });

    it('уровень ставит клетки ровно на высоту (с точностью до сегмента) и сбрасывает наклон, в пределах 0…MAX_LEVEL', () => {
        const map = flat(3, 1);
        map.cells[1]!.h = 7;
        map.cells[2]!.corners = [1, 0, 0, 0];
        expect(setLevel(map, [0, 1, 2], 1)).toEqual([1, 2]);
        expect(map.cells.map((c) => c.h)).toEqual([1, 1, 1]);
        expect(map.cells[2]!.corners).toBeUndefined();
        setLevel(map, [0], 40);
        expect(map.cells[0]!.h).toBe(MAX_LEVEL);
        setLevel(map, [0], 2.6);
        expect(map.cells[0]!.h).toBe(2.5);
    });

    it('покраска меняет только другие клетки и не ставит стену под юнита', () => {
        const map = flat(3, 1);
        map.cells[1]!.terrain = 'road';
        expect(paintCells(map, [0, 1, 2], 'road')).toEqual([0, 2]);
        expect(paintCells(map, [0, 1, 2], 'wall', (i) => i === 1)).toEqual([0, 2]);
        expect(map.cells.map((c) => c.terrain)).toEqual(['wall', 'road', 'wall']);
    });

    it('цель склона: углы по углам, края по краям, середина — ничего', () => {
        expect(slopeTarget(0.1, 0.9)).toEqual({ kind: 'corner', ix: 0, iz: 1 });
        expect(slopeTarget(0.95, 0.5)).toEqual({ kind: 'side', dx: 1, dz: 0 });
        expect(slopeTarget(0.5, 0.05)).toEqual({ kind: 'side', dx: 0, dz: -1 });
        expect(slopeTarget(0.5, 0.5)).toBeNull();
    });

    it('пандус по краю, повторный щелчок снимает; углы складываются, четыре угла — уровень выше', () => {
        const map = flat(1, 1);
        expect(applySlope(map, 0, { kind: 'side', dx: 1, dz: 0 })).toBe(true);
        expect(map.cells[0]!.corners).toEqual([0, 1, 1, 0]);
        expect(applySlope(map, 0, { kind: 'side', dx: 1, dz: 0 })).toBe(true);
        expect(map.cells[0]!.corners).toBeUndefined();
        for (const [ix, iz] of [[0, 0], [1, 0], [1, 1]] as const) applySlope(map, 0, { kind: 'corner', ix, iz });
        expect(map.cells[0]!.corners).toEqual([1, 1, 1, 0]);
        applySlope(map, 0, { kind: 'corner', ix: 0, iz: 1 });
        expect(map.cells[0]).toMatchObject({ h: 2 });
        expect(map.cells[0]!.corners).toBeUndefined();
    });

    it('склона нет на воде, стене и на самом верхнем уровне; ровную клетку не выравнивает', () => {
        const map = flat(3, 1);
        map.cells[0]!.terrain = 'deep';
        map.cells[1]!.h = MAX_LEVEL;
        expect(applySlope(map, 0, { kind: 'corner', ix: 0, iz: 0 })).toBe(false);
        expect(applySlope(map, 1, { kind: 'corner', ix: 0, iz: 0 })).toBe(false);
        expect(flattenCell(map, 2)).toBe(false);
        applySlope(map, 2, { kind: 'corner', ix: 1, iz: 1 });
        expect(flattenCell(map, 2)).toBe(true);
        expect(map.cells[2]!.corners).toBeUndefined();
    });

    it('снимок возвращает высоты, местность и склоны', () => {
        const map = flat(2, 1);
        const snap = snapshotCells(map);
        map.cells[0]!.h = 5;
        map.cells[1]!.terrain = 'deep';
        map.cells[1]!.corners = [1, 0, 0, 0];
        restoreCells(map, snap);
        expect(map.cells).toEqual(flat(2, 1).cells);
    });
});

describe('история правок', () => {
    it('отмена, повтор, новая правка обрывает повтор', () => {
        const h = new History<number>();
        expect(h.undo(0)).toBeNull();
        h.push(0); // 0 -> 1
        h.push(1); // 1 -> 2
        expect(h.undo(2)).toBe(1);
        expect(h.undo(1)).toBe(0);
        expect(h.redo(0)).toBe(1);
        h.push(1); // 1 -> 5
        expect(h.canRedo).toBe(false);
        expect(h.undo(5)).toBe(1);
    });

    it('держит не больше limit снимков', () => {
        const h = new History<number>(2);
        [0, 1, 2].forEach((v) => h.push(v));
        expect(h.undo(3)).toBe(2);
        expect(h.undo(2)).toBe(1);
        expect(h.undo(1)).toBeNull();
    });
});

describe('сущности в редакторе', () => {
    it('ставит по каталогу, бойцу — имя по стороне со свободным номером', () => {
        const list: Entity[] = [];
        list.push(makeEntity(list, 'mech', 'enemy', 0, 0));
        list.push(makeEntity(list, 'mech', 'enemy', 1, 0));
        list.push(makeEntity(list, 'tree', 'enemy', 2, 0));
        expect(list.map((e) => e.name)).toEqual(['Враг-1', 'Враг-2', 'дерево']);
        expect(list[2]).toEqual({ type: 'tree', pos: { x: 2, z: 0 }, team: 'neutral', name: 'дерево', hp: 60 });
        expect(list[0]!.mover?.chassis).toBe('legs');
    });

    it('не ставит в стену, в глубину без ховера и на занятую клетку; перенос на свою клетку можно', () => {
        const map = flat(4, 1);
        map.cells[1]!.terrain = 'wall';
        map.cells[2]!.terrain = 'deep';
        const list = [makeEntity([], 'mech', 'ally', 0, 0)];
        expect(standError(map, list, 'tree', undefined, 1, 0)).toMatchObject({ key: 'editor.stand.wall' });
        expect(standError(map, list, 'mech', list[0]!.mover, 2, 0)).toMatchObject({ key: 'editor.stand.deepHover' });
        expect(standError(map, list, 'mech', { ...list[0]!.mover!, chassis: 'hover' }, 2, 0)).toBeNull();
        expect(standError(map, list, 'tree', undefined, 0, 0)).toEqual({ key: 'editor.stand.occupied', args: ['Боец-1'] });
        expect(moveEntity(map, list, 0, 0, 0)).toBeNull();
        expect(moveEntity(map, list, 0, 3, 0)).toBeNull();
        expect(list[0]!.pos).toEqual({ x: 3, z: 0 });
        expect(entityAt(list, 3, 0)).toBe(0);
    });
});
