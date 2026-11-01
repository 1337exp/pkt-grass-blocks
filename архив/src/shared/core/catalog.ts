// Каталог видов сущностей (ENTITIES.md): что это за штука вообще — род, имя для людей, здоровье, чем ходит, мешает ли пройти,
// что с выстрелом сквозь неё. Общий для игры, редактора и сервера. Запись на карте (entity.ts) ссылается сюда по `type`.

import type { Mover } from './grid';
import type { WeaponId } from './weapons';

/** Род: боец (ходит, у него сторона) или объект (стоит, разрушаемый). Позже — барьер и метка миссии. */
export type EntityKind = 'fighter' | 'object';

/**
 * Что с выстрелом сквозь клетку: свободен, с помехой (красный ✕ на траектории: стрелять можно, но труднее — как во FM3, где ящик по
 * колено не запрещает выстрел, а режет точность) или закрыт (огонь невозможен: стена, большое здание). Сейчас закрывают только
 * местность и рельеф; все сущности — помеха.
 */
export type FireThrough = 'clear' | 'partial' | 'blocked';

export interface EntityType {
    kind: EntityKind;
    /** Имя вида для людей (палитра редактора, подсказки). */
    name: string;
    hp: number;
    /** Чем ходит по умолчанию (у бойцов). */
    mover?: Mover;
    /** Оружие по умолчанию (у бойцов). */
    weapon?: WeaponId;
    /** Мешает ли пройти и встать (никто никого не пропускает: ENTITIES.md, решение 1). */
    blocks: boolean;
    fire: FireThrough;
    /**
     * Высота прикрытия в уровнях над землёй клетки: выстрел, идущий над ней, не закрыт и не затруднён. Нет — прикрывает на любой
     * высоте (как было до учёта высот). Не размер модели, а «до какой высоты закрывает»: мех, контейнер и дерево с запасом выше груди
     * стрелка (1,4 уровня), чтобы ровный выстрел по-прежнему был закрыт, а сверху (с холма, из вертолёта) через них можно бить.
     */
    cover?: number;
    /**
     * Штраф точности, когда вид стоит на линии огня, п. п. (core/hit.ts). Помечено непроверенным: по записям дерево около −10%, ящик
     * и контейнер около −50%, угол платформы −20…30%; мех — заглушка.
     */
    coverPenalty?: number;
}

export const CATALOG = {
    mech: { kind: 'fighter', name: 'мех', hp: 100, mover: { chassis: 'legs', move: 5, up: 1, down: 1 }, weapon: 'rifle', blocks: true, fire: 'partial', cover: 1.2, coverPenalty: 30 },
    // вертолёт (ENTITIES.md, решение 2): летает над рельефом, под ним проходят, на его клетку не встать; выстрел идёт под ним
    heli: { kind: 'fighter', name: 'вертолёт', hp: 70, mover: { chassis: 'air', move: 7, up: 9, down: 9 }, weapon: 'machinegun', blocks: false, fire: 'clear' },
    tree: { kind: 'object', name: 'дерево', hp: 60, blocks: true, fire: 'partial', cover: 2, coverPenalty: 10 },
    container: { kind: 'object', name: 'контейнер', hp: 150, blocks: true, fire: 'partial', cover: 1, coverPenalty: 50 },
} satisfies Record<string, EntityType>;

export type EntityTypeId = keyof typeof CATALOG;

export const TYPE_IDS = Object.keys(CATALOG) as EntityTypeId[];

/** Описание вида или undefined, если такого нет. */
export function entityType(type: string): EntityType | undefined {
    return (CATALOG as Record<string, EntityType>)[type];
}
