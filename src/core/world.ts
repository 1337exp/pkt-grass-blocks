// Мир из колонн. Колонны, которой нет, нет и в карте: это дыра. В колонне несколько сплошных пролётов, между ними воздух.

import { DEFAULT_MATERIALS, type MaterialDef } from './materials';
import { type Corners } from './slope';

/** Ошибка данных мира: сообщение для человека, который правит файл или смотрит в редактор. */
export class WorldError extends Error {}

/**
 * Сплошной пролёт в колонне. `y0` включительно, `y1` не включительно: `0:3` — три блока, верх на высоте 3.
 * `corners` поднимают углы верхней грани ещё на блок. Имеют смысл, только если над пролётом есть воздух.
 */
export interface Span {
    y0: number;
    y1: number;
    material: string;
    corners?: Corners;
}

/** Предмет на площадке. Топологию не меняет. `yaw` — четверти оборота. */
export interface Prop {
    id: string;
    type: string;
    x: number;
    z: number;
    /** Высота площадки, на которой стоит: верх пролёта (`y1`). */
    y: number;
    yaw: 0 | 1 | 2 | 3;
}

/** Час — время суток (0…24). `cycleHours` — сколько реальных часов длится игровые сутки; 0 значит время стоит. */
export interface Sky {
    hour: number;
    cycleHours: number;
}

/** Карта. Колонны адресуются ключом `x,z`. Правки возвращают новый мир и не меняют старый. */
export interface World {
    name: string;
    /** Метров в ребре блока. Единица мира Three.js — метр, блок по умолчанию 1×1×1 м. */
    block: number;
    columns: ReadonlyMap<string, readonly Span[]>;
    props: readonly Prop[];
    sky: Sky;
    materials: ReadonlyMap<string, MaterialDef>;
}

export const columnKey = (x: number, z: number): string => `${x},${z}`;

export function spansAt(world: World, x: number, z: number): readonly Span[] {
    return world.columns.get(columnKey(x, z)) ?? [];
}

/** Блок (x, y, z) занят пролётом. Наклон над `y1` блоком не считается: это грань, а не куб. */
export function occupied(world: World, x: number, y: number, z: number): boolean {
    return spansAt(world, x, z).some((s) => y >= s.y0 && y < s.y1);
}

export function materialOf(world: World, id: string): MaterialDef | undefined {
    return world.materials.get(id);
}

export interface Bounds {
    x0: number;
    x1: number;
    /** Нижний занятый блок. */
    y0: number;
    /** Верх самой высокой грани, не включительно. */
    y1: number;
    z0: number;
    z1: number;
}

/** Габарит занятых блоков. Уклоны поднимают верхнюю границу. Пустой мир — null. */
export function bounds(world: World): Bounds | null {
    let box: Bounds | null = null;
    for (const [key, spans] of world.columns) {
        const [xs, zs] = key.split(',');
        const x = Number(xs);
        const z = Number(zs);
        for (const s of spans) {
            const top = s.y1 + (s.corners?.reduce((m, v) => Math.max(m, v), 0) ?? 0);
            if (!box) box = { x0: x, x1: x, y0: s.y0, y1: top, z0: z, z1: z };
            else {
                box.x0 = Math.min(box.x0, x);
                box.x1 = Math.max(box.x1, x);
                box.y0 = Math.min(box.y0, s.y0);
                box.y1 = Math.max(box.y1, top);
                box.z0 = Math.min(box.z0, z);
                box.z1 = Math.max(box.z1, z);
            }
        }
    }
    return box;
}

export function createWorld(name = 'Карта'): World {
    const materials = new Map<string, MaterialDef>();
    return {
        name,
        block: 1,
        columns: new Map(),
        props: [],
        sky: { hour: 12, cycleHours: 0 },
        materials,
    };
}

/** Мир со справочником по умолчанию. Так открывается редактор и образец. */
export function createReadyWorld(name = 'Карта'): World {
    return { ...createWorld(name), materials: new Map(DEFAULT_MATERIALS.map((m) => [m.id, { ...m }])) };
}
