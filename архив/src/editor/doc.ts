// Открытая в редакторе карта: клетки, поле на сцене и история правок. Правки идут через документ: он делает снимок до,
// пересобирает поле после и кладёт шаг в историю. Сущности чужого файла остаются в снимке, но на сцену не ставятся.

import type { Entity } from '@shared/core/entity';
import type { GridMap } from '@shared/core/grid';
import type { LoadedMap } from '@shared/core/mapFile';
import { Board } from '@shared/view/board';
import type { Stage } from '@shared/view/stage';
import { History } from './history';
import { type CellsSnapshot, growMap, mapFromSnapshot, restoreCells, snapshotCells } from './ops';
import { session } from './session';
import { ed } from './state';

/** Снимок для отмены: клетки и сущности. */
export interface Snapshot {
    size: [number, number];
    cells: CellsSnapshot;
    entities: Entity[];
}

export class Doc {
    /** Редактор карту только строит: фигуры игры на сцену не ставит. Поле в снимке остаётся, чтобы сохранение не стирало чужой файл. */
    readonly history = new History<Snapshot>();
    /** Карта на момент открытия или сохранения (снимок и имя): «не сохранено» — только если сейчас она другая. */
    private saved = '';

    private constructor(
        public loaded: LoadedMap,
        readonly board: Board,
    ) {
        this.syncViews();
        this.markSaved();
    }

    /** Первая открытая карта: поле на сцену. Дальше то же поле переиспользуется (open). */
    static create(stage: Stage, loaded: LoadedMap): Doc {
        const board = new Board(loaded.map);
        stage.setBoard(board);
        return new Doc(loaded, board);
    }

    get map(): GridMap {
        return this.loaded.map;
    }

    get entities(): Entity[] {
        return this.loaded.entities;
    }

    /** Другая карта в то же поле: материалы и вид остаются, история с чистого листа. */
    open(loaded: LoadedMap): void {
        this.loaded = loaded;
        this.board.rebuild(loaded.map);
        session.levels();
        this.history.clear();
        this.syncViews();
        this.syncHistory();
        this.markSaved();
    }

    private key(): string {
        return JSON.stringify([this.loaded.name, this.snapshot()]);
    }

    /** Карта сейчас такая, как на диске. */
    markSaved(): void {
        this.saved = this.key();
        ed.dirty = false;
    }

    /** «Не сохранено» — честно: отменил все правки до сохранённого — снова сохранено. */
    updateDirty(): void {
        ed.dirty = this.key() !== this.saved;
    }

    /** На сцене только рельеф: фигуры игры сюда не ставятся. */
    syncViews(): void {
        this.board.setPieces(() => []);
    }

    snapshot(): Snapshot {
        return { size: [this.map.w, this.map.d], cells: snapshotCells(this.map), entities: structuredClone(this.entities) };
    }

    syncHistory(): void {
        ed.canUndo = this.history.canUndo;
        ed.canRedo = this.history.canRedo;
    }

    /** Клетки поменялись: поле пересобрать, фигуры поставить на новую высоту, курсор и след кисти обновить. */
    cellsEdited(): void {
        this.board.rebuild(this.map);
        ed.size = `${this.map.w}×${this.map.d}`;
        this.updateDirty();
        session.levels();
        session.refresh();
        this.syncHistory();
    }

    /** Сущности поменялись: фигуры заново, карта не сохранена. */
    entitiesEdited(): void {
        this.updateDirty();
        this.syncViews();
        session.refresh();
        this.syncHistory();
    }

    /**
     * Одна правка целиком: снимок до, `change` меняет данные и говорит, поменялось ли; если да — шаг в историю и пересборка
     * клеток или фигур.
     */
    edit(kind: 'cells' | 'entities', change: () => boolean): boolean {
        const before = this.snapshot();
        if (!change()) return false;
        this.history.push(before);
        if (kind === 'cells') this.cellsEdited();
        else this.entitiesEdited();
        return true;
    }

    /** Расширить карту до клетки (x, z) вне её границ (в истории — одним шагом). */
    grow(x: number, z: number): boolean {
        const ok = this.edit('cells', () => {
            const g = growMap(this.map, this.entities, x, z);
            if (g) this.loaded.map = g;
            return !!g;
        });
        if (ok) {
            session.hover = null;
            this.syncViews();
            session.refresh();
        }
        return ok;
    }

    /** Отменить (или повторить) шаг: клетки и сущности как были. */
    undo(redo = false): void {
        const now = this.snapshot();
        const to = redo ? this.history.redo(now) : this.history.undo(now);
        if (!to) return;
        if (to.size[0] === this.map.w && to.size[1] === this.map.d) restoreCells(this.map, to.cells);
        else {
            this.loaded.map = mapFromSnapshot(to.size[0], to.size[1], to.cells);
            session.hover = null;
        }
        this.loaded.entities = to.entities;
        this.syncViews();
        this.cellsEdited();
        session.restored();
    }
}
