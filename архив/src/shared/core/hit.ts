// Шанс попадания (COMBAT.md, «Итоговая точность», шаг 2): подтверждённая форумом RPGDL формула FM3
//
//   итог % = [ базовая точность оружия × (1 + бонус рук) × (1 − уклонение цели) ] − штрафы
//
// Штрафы вычитаются: высота (−5% за уровень, если стрелок ниже цели; ближний бой освобождён), дальность (своя на клетку у оружия, со второй клетки),
// помехи на линии (у вида сущности в каталоге). Числа оружия, рук и помех — кандидаты из справочных ответов, **не проверены по игре**
// (помечены в weapons.ts и catalog.ts): итог можно сверять с видео и подправлять. Только правила, без графики.

import type { Weapon } from './weapons';

/** Стандартные руки: +5% к точности (множитель 1,05). Непроверено. */
export const DEFAULT_ARM_BONUS = 0.05;
/** Предел уклонения в игре (по справочному ответу, непроверено). */
export const EVASION_CAP = 0.59;
/** Штраф за уровень, когда стрелок ниже цели, п. п. (подтверждено RPGDL). */
export const HEIGHT_PENALTY_PER_LEVEL = 5;

/**
 * Штраф точности за каждый красный ✕ у края обрыва (core/fire.ts): частичное укрытие, не запрет. В игре Боец-1 с пулемётом по Враг-1 с двумя ✕
 * на перепаде 4 даёт 21%, при нашей высоте (−20) и дальности (−40): на ✕ остаётся меньше 17 п. п., прежние 25 были завышены. 10 наше значение, меняется по ощущению от игры.
 */
export const PLATFORM_EDGE_PENALTY = 10;

export interface HitInput {
    weapon: Weapon;
    /** Бонус точности рук бойца: 0,05 = +5%, множитель 1 + бонус. */
    armBonus: number;
    /** Уклонение цели, доля: ноги плюс поправка местности, где она стоит (до предела `EVASION_CAP`). */
    evasion: number;
    /** Уровни клетки цели минус уровни клетки стрелка (плюс: цель выше). */
    heightDiff: number;
    /** Шагов по клеткам между ними (по Манхэттену). */
    distance: number;
    /** Суммарный штраф помех на линии, п. п. (только у прямого огня). */
    coverPenalty: number;
}

/** Результат со всеми слагаемыми: чтобы показать разбор и сверять с игрой. Штрафы в процентных пунктах. */
export interface HitResult {
    /** Итог, целые проценты в 0…100. */
    percent: number;
    /** Итог до округления и обрезки (бывает больше 100 или меньше 0). */
    raw: number;
    base: number;
    /** Множитель рук (1 + бонус; у оружия без учёта рук 1). */
    armMul: number;
    evasion: number;
    height: number;
    range: number;
    cover: number;
}

export function hitChance(i: HitInput): HitResult {
    const w = i.weapon;
    const base = w.accuracy;
    const armMul = w.armApplies === false ? 1 : 1 + i.armBonus;
    const evasion = Math.min(EVASION_CAP, Math.max(0, i.evasion));
    const height = w.trajectory === 'melee' || w.heightFree ? 0 : HEIGHT_PENALTY_PER_LEVEL * Math.max(0, i.heightDiff);
    const range = (w.rangePenalty ?? 0) * Math.max(0, i.distance - 1); // вплотную штрафа нет, он со второй клетки (по игре: 85, 83, 81%)
    const cover = w.trajectory === 'direct' ? i.coverPenalty : 0;
    const raw = base * armMul * (1 - evasion) - height - range - cover;
    return { percent: Math.min(100, Math.max(0, Math.round(raw))), raw, base, armMul, evasion, height, range, cover };
}
