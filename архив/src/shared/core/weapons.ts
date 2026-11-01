// Оружие (COMBAT.md): дальность, траектория, площадь, точность, цена в ОД. Числа из справочника FM3 (Technical Data Guide, Luxion):
// ручное оружие (ближний бой, дробовик, пулемёт, винтовка, огнемёт, пушка, луч) и плечевое (ракеты, гранаты). Дальность считается
// так же, как в справочнике: расстоянием от центра клетки стрелка в шагах по клеткам (|dx| + |dz|), соседняя клетка 1, оба числа
// «от игрока». Только данные и правила, без графики.

import { type Cell, cornerLevel, type GridMap, isSloped, type Pos } from './grid';

/** Перепад высоты, который ближний бой принимает: полуровня (1 сегмент). Проверено в игре: перепад в целый уровень даёт шанс 0%. */
export const MELEE_REACH = 0.5;

/**
 * Траектория:
 *   melee  — ближний бой: соседняя клетка, перепад высоты не больше `reach`;
 *   direct — прямой огонь: нужна свободная линия (core/fire.ts); стена, контейнер, мех на пути закрывают, дерево мешает;
 *   arc    — навесной: летит дугой над препятствиями, линия не нужна.
 */
export type Trajectory = 'melee' | 'direct' | 'arc';

export interface Weapon {
    trajectory: Trajectory;
    /** Дальность в клетках: от и до (|dx| + |dz|). */
    range: [number, number];
    /** Ближний бой: на сколько уровней цель может быть выше или ниже (по игре полуровня: целый уровень игра не принимает, шанс 0%). */
    reach?: number;
    /** Площадь: радиус задетых клеток вокруг цели (0 — только цель). */
    area?: number;
    /** Базовая точность, % (core/hit.ts), из справочника FM3. */
    accuracy: number;
    /** Штраф точности за клетку дальности, п. п. (Acc/Rg справочника: пулемёт 10, дробовик, винтовка и огнемёт 2, пушка 4, остальное 0). */
    rangePenalty?: number;
    /** Перепад высоты не режет точность (справочник: ближний бой, ракеты и гранаты «−0% на уровень», у остальных −5%). */
    heightFree?: boolean;
    /** Учитывать ли бонус рук (у ракет и гранатомёта «фиксированная точность», непроверено). */
    armApplies?: boolean;
    /** Цена атаки в очках действия (core/ap.ts), из справочника FM3: ближний бой 1, дробовик 3, винтовка 4, пулемёт 5, пушка 6, огнемёт 4/7/11, ракеты 10, гранатомёт 12, луч 15. */
    ap: number;
    /** Урон одного попадания и сколько попаданий в выстреле (дробь, очередь); из справочника FM3 для слабейшего оружия типа. Не задан: данных нет. */
    damage?: number;
    hits?: number;
    /** Боезапас; не задан: бесконечный. */
    ammo?: number;
}

/**
 * Дальность как в справочнике: расстояние от центра стрелка до центра цели в шагах (соседняя клетка 1), оба числа «от игрока». 3–9 значит:
 * клетки на расстоянии 1 и 2 не горят, а с 3 по 9 горят. Минимум нигде не ниже 1: «0» у ближнего боя во FM3 лишь пометка зоны контакта
 * тел ванзеров, нам она не нужна (кулак всегда 1–1).
 */
const range = (min: number, max: number): [number, number] => [Math.max(1, min), max];

// Числа справочника: точность (Acc), цена в ОД (AP), штраф точности на клетку дальности (Acc/Rg); урон, число попаданий и боезапас (Attack, Ammo)
// слабейшего оружия типа (ludo.guide, гайд по ремейку FM3). «Снайперская винтовка» там обычная
// винтовка (Mk9 Sniper — тип Rifles, 1–6), своей дальности у неё нет. Базуки в справочнике нет, убрана; есть огнемёт, луч и пушка.
export const WEAPONS = {
    // ближний бой: всегда 1 клетка; кулак 100%, дубина и топор 120%, шип 110%; перепад высоты точность не режет
    knuckle: { trajectory: 'melee', range: [1, 1], reach: MELEE_REACH, accuracy: 100, ap: 1, heightFree: true, damage: 76, hits: 1 },
    rod: { trajectory: 'melee', range: [1, 1], reach: MELEE_REACH, accuracy: 120, ap: 1, heightFree: true, damage: 56, hits: 1 },
    spike: { trajectory: 'melee', range: [1, 1], reach: MELEE_REACH, accuracy: 110, ap: 1, heightFree: true, damage: 63, hits: 1 },
    shotgun: { trajectory: 'direct', range: range(1, 3), accuracy: 75, rangePenalty: 2, ap: 3, damage: 12, hits: 12 },
    machinegun: { trajectory: 'direct', range: range(1, 4), accuracy: 80, rangePenalty: 10, ap: 5, damage: 11, hits: 10 },
    rifle: { trajectory: 'direct', range: range(1, 6), accuracy: 75, rangePenalty: 2, ap: 4, damage: 58, hits: 1 },
    sniper: { trajectory: 'direct', range: range(1, 6), accuracy: 75, rangePenalty: 2, ap: 4, damage: 69, hits: 1 },
    // огнемёт: 4, 7 или 11 ОД по выбору мощности (пока берём 4: выбор мощности не сделан)
    flamer: { trajectory: 'direct', range: range(1, 2), accuracy: 60, rangePenalty: 2, ap: 4, damage: 17, hits: 4 },
    // урона пушки в справочнике (страницы с таблицами) не нашлось: не задан
    cannon: { trajectory: 'direct', range: range(2, 6), accuracy: 75, rangePenalty: 4, ap: 6 },
    beam: { trajectory: 'direct', range: range(1, 9), accuracy: 90, ap: 15, damage: 250, hits: 1 },
    // плечевое: перепад высоты не режет точность (в справочнике «ракеты и гранаты −0% на уровень»), руки не берут (непроверено); боезапас конечный
    missile: { trajectory: 'arc', range: range(3, 9), accuracy: 80, armApplies: false, ap: 10, heightFree: true, damage: 73, hits: 1, ammo: 6 },
    grenade: { trajectory: 'arc', range: range(3, 6), area: 1, accuracy: 60, armApplies: false, ap: 12, heightFree: true, damage: 62, hits: 1, ammo: 4 },
} satisfies Record<string, Weapon>;

export type WeaponId = keyof typeof WEAPONS;
export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];
export const DEFAULT_WEAPON: WeaponId = 'rifle';

export function weaponOf(id: string | undefined): Weapon {
    return (WEAPONS as Record<string, Weapon>)[id ?? DEFAULT_WEAPON] ?? WEAPONS[DEFAULT_WEAPON];
}

export const isWeaponId = (v: unknown): v is WeaponId => typeof v === 'string' && v in WEAPONS;

/** Шагов по клеткам между клетками. */
export const cellDistance = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);

/**
 * Достаёт ли оружие от клетки `a` до клетки `b` по дальности (и по перепаду высоты у ближнего боя: `dh` — уровни цели минус
 * уровни стрелка). Линию огня проверяет core/fire.ts.
 */
export function inRange(w: Weapon, a: { x: number; z: number }, b: { x: number; z: number }, dh = 0, bridged = false): boolean {
    const d = cellDistance(a, b);
    if (d < w.range[0] || d > w.range[1]) return false;
    return w.trajectory !== 'melee' || bridged || Math.abs(dh) <= (w.reach ?? 0);
}

/**
 * Склон снимает у ближнего боя ограничение по высоте (по игре): одна из двух соседних клеток склон, другая ровная, и край склона у общей
 * стороны стыкуется с высотой ровной клетки (хотя бы один из двух углов стороны не дальше `MELEE_REACH` по высоте от неё). Тогда склон
 * перекрывает перепад в целый уровень, и удар возможен, а бок склона у обрыва (угол далеко по высоте) ограничения не снимает.
 */
export function slopeBridged(a: Cell, b: Cell): boolean {
    if (cellDistance(a, b) !== 1 || isSloped(a) === isSloped(b)) return false;
    const [ramp, flat] = isSloped(a) ? [a, b] : [b, a];
    const dx = flat.x - ramp.x;
    const dz = flat.z - ramp.z;
    // два угла склона у стороны, обращённой к ровной клетке (ix, iz: 0 у меньшей координаты, 1 у большей)
    const edge: [number, number][] = dx ? [[dx > 0 ? 1 : 0, 0], [dx > 0 ? 1 : 0, 1]] : [[0, dz > 0 ? 1 : 0], [1, dz > 0 ? 1 : 0]];
    return edge.some(([ix, iz]) => Math.abs(cornerLevel(ramp, ix, iz) - flat.h) <= MELEE_REACH);
}

/**
 * Радиус атаки: все клетки карты, куда оружие достаёт от клетки `from` (дальность от и до, у ближнего боя ещё и перепад высоты
 * клетки против `fromLevel`), — без учёта препятствий и стоящих на клетках: оранжевая подсветка во втором слое хода (как во FM3).
 * Есть ли на пути помехи, показывает линия огня (core/fire.ts) уже для цели в радиусе. `dist` — шагов от стрелка.
 */
export function attackCells(map: GridMap, from: Pos, w: Weapon, fromLevel: number): { i: number; dist: number }[] {
    const out: { i: number; dist: number }[] = [];
    for (const c of map.cells) {
        const here = map.at(from.x, from.z);
        if (inRange(w, from, c, c.h - fromLevel, w.trajectory === 'melee' && !!here && slopeBridged(here, c))) out.push({ i: map.index(c.x, c.z), dist: cellDistance(from, c) });
    }
    return out;
}
