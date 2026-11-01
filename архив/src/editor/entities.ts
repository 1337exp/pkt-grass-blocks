// Правки сущностей для инструмента «Объекты» (ENTITIES.md): поставить, проверить клетку, перенести, убрать. Чистые функции над
// списком сущностей карты, без графики (тесты в tests/editor.test.ts). Проверки те же, что у файла карты (parseMap): иначе
// редактор собрал бы карту, которая потом не сохранится.

import { entityType } from '@shared/core/catalog';
import type { Entity, Team } from '@shared/core/entity';
import type { GridMap, Mover } from '@shared/core/grid';
import type { MessageKey } from '@shared/i18n';

/** Номер сущности на клетке или −1. */
export function entityAt(entities: Entity[], x: number, z: number): number {
    return entities.findIndex((e) => e.pos.x === x && e.pos.z === z);
}

/** Почему здесь не стоять: ключ словаря и его аргументы (переводит тот, кто показывает). */
export interface StandError {
    key: MessageKey;
    args?: string[];
}

/**
 * Почему сущность вида `type` (с шасси `mover`) не может стоять на клетке (x, z), или null — может. `self` — номер той, что
 * переносим (своя же клетка не занята).
 */
export function standError(map: GridMap, entities: Entity[], type: string, mover: Mover | undefined, x: number, z: number, self = -1): StandError | null {
    const c = map.at(x, z);
    if (!c) return { key: 'editor.stand.offMap' };
    const air = mover?.chassis === 'air'; // вертолёт висит над любой клеткой
    if (c.terrain === 'wall' && !air) return { key: 'editor.stand.wall' };
    if (c.terrain === 'deep' && mover?.chassis !== 'hover' && !air) return { key: mover ? 'editor.stand.deepHover' : 'editor.stand.deep' };
    const other = entityAt(entities, x, z);
    if (other !== -1 && other !== self) return { key: 'editor.stand.occupied', args: [entities[other]!.name] };
    if (!entityType(type)) return { key: 'editor.stand.unknown', args: [type] };
    return null;
}

/** Имя нового бойца: по стороне и следующему свободному номеру («Враг-4»). */
const TEAM_PREFIX: Record<Team, string> = { ally: 'Боец', enemy: 'Враг', neutral: 'Нейтрал' };

export function nextName(entities: Entity[], team: Team): string {
    const prefix = TEAM_PREFIX[team];
    const taken = new Set(entities.map((e) => e.name));
    let n = 1;
    while (taken.has(`${prefix}-${n}`)) n++;
    return `${prefix}-${n}`;
}

/** Новая сущность вида `type` на клетке: всё по каталогу, бойцу — сторона и имя. Не проверяет клетку (см. standError). */
export function makeEntity(entities: Entity[], type: string, team: Team, x: number, z: number): Entity {
    const t = entityType(type)!;
    if (t.kind !== 'fighter') return { type, pos: { x, z }, team: 'neutral', name: t.name, hp: t.hp };
    return { type, pos: { x, z }, team, name: nextName(entities, team), hp: t.hp, mover: { ...t.mover! }, ...(t.weapon && { weapon: t.weapon }) };
}

/** Перенести сущность `i` на клетку (x, z); null — перенесли, иначе почему нельзя. */
export function moveEntity(map: GridMap, entities: Entity[], i: number, x: number, z: number): StandError | null {
    const e = entities[i]!;
    const err = standError(map, entities, e.type, e.mover, x, z, i);
    if (err) return err;
    e.pos = { x, z };
    return null;
}
