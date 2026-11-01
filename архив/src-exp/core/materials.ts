// Материалы пролёта. Цена шага, укрытие и линия огня сюда не входят: их считает игра, которая читает флаги.

/** Флаги материала. Неизвестный игре id она может принести своим справочником. */
export interface MaterialDef {
    id: string;
    /** На верхней грани можно закончить ход. */
    standable: boolean;
    /** Жидкость: вода, не дыра. По умолчанию на неё не встают. */
    liquid: boolean;
}

/** Справочник, с которым открывается новая карта. Игра может подменить флаги и добавить свои id. */
export const DEFAULT_MATERIALS: readonly MaterialDef[] = [
    { id: 'grass', standable: true, liquid: false },
    { id: 'dirt', standable: true, liquid: false },
    { id: 'rock', standable: true, liquid: false },
    { id: 'sand', standable: true, liquid: false },
    { id: 'wood', standable: true, liquid: false },
    { id: 'water', standable: false, liquid: true },
    { id: 'wall', standable: false, liquid: false },
];

const DEFAULT_BY_ID = new Map(DEFAULT_MATERIALS.map((m) => [m.id, m]));

export const isMaterialId = (id: string): boolean => /^[a-z][a-z0-9-]*$/.test(id);

export function defaultMaterial(id: string): MaterialDef | undefined {
    const m = DEFAULT_BY_ID.get(id);
    return m ? { ...m } : undefined;
}

/** Чем запись отличается от справочника по умолчанию. Пустой объект — совпадает или материала там нет. */
export function materialDelta(m: MaterialDef): { standable?: boolean; liquid?: boolean } | null {
    const base = DEFAULT_BY_ID.get(m.id);
    if (!base) return { standable: m.standable, liquid: m.liquid };
    const out: { standable?: boolean; liquid?: boolean } = {};
    if (m.standable !== base.standable) out.standable = m.standable;
    if (m.liquid !== base.liquid) out.liquid = m.liquid;
    return Object.keys(out).length ? out : null;
}
