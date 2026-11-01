// Сущности на карте (ENTITIES.md): всё, что стоит на клетке поверх рельефа — бойцы (мехи, позже техника), объекты (деревья,
// контейнеры). Только данные, без графики: их читает формат карты и правила хода, рисует view/units.ts и view/props.ts.
// Общее для вида (род, здоровье, мешает ли пройти) — в каталоге (catalog.ts), здесь — только то, что отличает эту штуку.

import type { Mover, Pos } from './grid';

/** Сторона: свои, чужие, нейтралы (мирные: защищать или не задевать). У объектов — нейтралы. */
export type Team = 'ally' | 'enemy' | 'neutral';

/** Сущность на карте. `mover` — у бойцов (у объектов нет). */
export interface Entity {
    /** Вид из каталога (catalog.ts). */
    type: string;
    pos: Pos;
    team: Team;
    /** Имя для людей; у объектов — имя вида. */
    name: string;
    hp: number;
    mover?: Mover;
    /** Оружие (у бойцов; core/weapons.ts). */
    weapon?: string;
    /** Бонус точности рук (0,05 = +5%) и уклонение ног (0,1 = 10%): для шанса попадания (core/hit.ts); нет — стандартные. */
    arm?: number;
    evasion?: number;
    /** Предел пула очков действия и подзарядка в начале хода (core/ap.ts); нет — 12 и 12. */
    apMax?: number;
    apCharge?: number;
}

/** Боец: сущность, которая ходит и стреляет (у неё есть шасси, очки хода и оружие). */
export type UnitSpec = Entity & { mover: Mover; weapon: string };

export const isFighter = (e: Entity): e is UnitSpec => !!e.mover;
