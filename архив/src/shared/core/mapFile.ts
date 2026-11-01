// Файл карты (public/maps/*.json): читает игра, пишет редактор, проверяют оба одной функцией, поэтому битая карта не откроется
// ни там, ни там. Формат удобен глазам и git: каждый ряд карты — своя строка файла, правка клетки — одна строка диффа.
//
//   height   — по строке на ряд z, символ на клетку: высота в сегментах по полуровня, цифра или буква 0–9a–z (два сегмента — уровень, до 17,5 уровня);
//   terrain  — те же ряды, символ на клетку (см. TERRAIN_CHAR);
//   slopes   — только наклонные клетки: подъёмы углов строкой из четырёх цифр в порядке Corners;
//   entities — сущности на карте (ENTITIES.md): вид из каталога, клетка и то, что отличает эту штуку от вида.
//
// Версия 3. Старые версии не читаются: карты в репозитории переведены, поддержки старых форматов нет.

import { entityType, TYPE_IDS } from './catalog';
import type { Entity, Team } from './entity';
import { type Cell, type Chassis, type Corners, GridMap, type Terrain } from './grid';
import { AP_CHARGE_CAP, AP_MAX_CAP } from './ap';
import { EVASION_CAP } from './hit';
import { isWeaponId, WEAPON_IDS } from './weapons';

export const MAP_VERSION = 3;

/** Карта по умолчанию: её открывают игра и редактор без `?map=`. */
export const DEFAULT_MAP = 'fire';

/** Сегментов в уровне: высота хранится в сегментах по полуровня, уровень делится на два. */
export const SEGMENTS_PER_LEVEL = 2;

/** Самый высокий уровень: в файле высота — один символ 0–9a–z, 35 сегментов. */
export const MAX_LEVEL = 35 / SEGMENTS_PER_LEVEL;

/** Символ местности в файле. Те же, что в тестах grid.test.ts. */
export const TERRAIN_CHAR: Record<Terrain, string> = { plain: '.', road: '=', rough: 'r', shallow: 's', deep: '~', wall: '#' };
const CHAR_TERRAIN = Object.fromEntries(Object.entries(TERRAIN_CHAR).map(([t, ch]) => [ch, t])) as Record<string, Terrain>;

/** Сущность в файле: вид и клетка обязательны, остальное — если отличается от вида (у бойцов пишется всегда). */
export interface EntityRecord {
    type: string;
    at: [number, number];
    team?: Team;
    name?: string;
    chassis?: Chassis;
    move?: number;
    up?: number;
    down?: number;
    hp?: number;
    weapon?: string;
    /** Бонус точности рук и уклонение ног, доли (необязательно: стандартные у бойца). */
    arm?: number;
    evasion?: number;
    /** Предел пула очков действия (1…30) и подзарядка в начале хода (0…15). */
    apMax?: number;
    apCharge?: number;
}

export interface MapFile {
    version: number;
    name: string;
    size: [number, number];
    height: string[];
    terrain: string[];
    slopes: { at: [number, number]; corners: string }[];
    entities: EntityRecord[];
}

export interface LoadedMap {
    name: string;
    map: GridMap;
    entities: Entity[];
}

const TEAMS: Team[] = ['ally', 'enemy', 'neutral'];
const CHASSIS: Chassis[] = ['legs', 'tracks', 'hover', 'air'];

/** Ошибка формата карты: сообщение для человека (кто правит файл или смотрит в редактор). */
export class MapError extends Error {}

function fail(msg: string): never {
    throw new MapError(msg);
}

const isInt = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** Разбор и проверка файла карты. Бросает MapError с объяснением, что не так и где. */
export function parseMap(data: unknown): LoadedMap {
    const f = data as Partial<MapFile> | null;
    if (!f || typeof f !== 'object') fail('файл карты пустой или не объект');
    if (f.version !== MAP_VERSION) fail(`версия карты ${String(f.version)}, умеем только ${MAP_VERSION}`);
    const name = typeof f.name === 'string' && f.name ? f.name : fail('у карты нет имени');
    const [w, d] = Array.isArray(f.size) && isInt(f.size[0], 1, 200) && isInt(f.size[1], 1, 200) ? f.size : fail('размер карты: [ширина, глубина] от 1 до 200');
    const rows = (key: 'height' | 'terrain'): string[] => {
        const r = f[key];
        if (!Array.isArray(r) || r.length !== d) fail(`${key}: нужно ${d} строк, по одной на ряд`);
        r.forEach((row, z) => {
            if (typeof row !== 'string' || row.length !== w) fail(`${key}, ряд ${z}: нужно ${w} символов`);
        });
        return r;
    };
    const height = rows('height');
    const terrain = rows('terrain');

    const cells: Cell[] = [];
    for (let z = 0; z < d; z++) {
        for (let x = 0; x < w; x++) {
            const hc = height[z]![x]!;
            const tc = terrain[z]![x]!;
            if (!/[0-9a-z]/.test(hc)) fail(`height, клетка (${x}, ${z}): «${hc}» не цифра и не буква a–z`);
            const t = CHAR_TERRAIN[tc] ?? fail(`terrain, клетка (${x}, ${z}): неизвестный символ «${tc}»`);
            cells.push({ x, z, h: parseInt(hc, 36) / SEGMENTS_PER_LEVEL, terrain: t });
        }
    }
    const map = new GridMap(w, d, cells);

    for (const s of f.slopes ?? []) {
        const [x, z] = s.at ?? [];
        const c = isInt(x, 0, w - 1) && isInt(z, 0, d - 1) ? map.at(x, z)! : fail(`slopes: клетка ${JSON.stringify(s.at)} вне карты`);
        if (!/^[01]{4}$/.test(s.corners)) fail(`slopes, клетка (${x}, ${z}): углы — четыре цифры 0 или 1, а не «${s.corners}»`);
        c.corners = [...s.corners].map(Number) as Corners;
    }

    const records: EntityRecord[] = f.entities ?? [];
    const taken = new Set<string>();
    const entities = records.map((r, i) => {
        const e = parseEntity(r, i, map);
        const key = `${e.pos.x},${e.pos.z}`;
        if (taken.has(key)) fail(`${e.name}: клетка (${e.pos.x}, ${e.pos.z}) уже занята`);
        taken.add(key);
        return e;
    });

    return { name, map, entities };
}

/** Одна сущность из файла: вид известен, клетка на карте и годится, недостающее — из каталога. */
function parseEntity(r: EntityRecord, i: number, map: GridMap): Entity {
    const t = entityType(r.type) ?? fail(`сущность ${i}: неизвестный вид «${String(r.type)}», есть ${TYPE_IDS.join(', ')}`);
    const fighter = t.kind === 'fighter';
    if (fighter && (typeof r.name !== 'string' || !r.name)) fail(`${t.name} ${i}: нет имени`);
    const who = `${t.name} ${r.name ?? i}`;
    const team = r.team ?? (fighter ? fail(`${who}: нет стороны`) : 'neutral');
    if (!TEAMS.includes(team)) fail(`${who}: сторона ${String(team)}, нужна ${TEAMS.join(', ')}`);
    for (const k of ['move', 'up', 'down', 'hp'] as const) if (r[k] !== undefined && !isInt(r[k], 0, 9999)) fail(`${who}: ${k} должно быть целым числом`);
    if (r.chassis !== undefined && !CHASSIS.includes(r.chassis)) fail(`${who}: шасси ${String(r.chassis)}, нужно ${CHASSIS.join(', ')}`);
    if (r.weapon !== undefined && !isWeaponId(r.weapon)) fail(`${who}: оружие ${String(r.weapon)}, есть ${WEAPON_IDS.join(', ')}`);
    const [x, z] = r.at ?? [];
    const c = isInt(x, 0, map.w - 1) && isInt(z, 0, map.d - 1) ? map.at(x, z)! : fail(`${who}: клетка ${JSON.stringify(r.at)} вне карты`);
    const base = t.mover;
    const mover = base && { chassis: r.chassis ?? base.chassis, move: r.move ?? base.move, up: r.up ?? base.up, down: r.down ?? base.down };
    // вертолёт висит над любой клеткой, ховер стоит и на глубокой воде; остальным — не в стене и не в глубокой воде
    const air = mover?.chassis === 'air';
    if (c.terrain === 'wall' && !air) fail(`${who}: стоит в стене (${x}, ${z})`);
    if (c.terrain === 'deep' && mover?.chassis !== 'hover' && !air) fail(mover ? `${who}: в глубокой воде (${x}, ${z}) может стоять только ховер` : `${who}: в глубокой воде (${x}, ${z}) не стоит`);
    const weapon = fighter ? (r.weapon ?? t.weapon) : undefined;
    if (r.arm !== undefined && !(typeof r.arm === 'number' && r.arm >= 0 && r.arm <= 3)) fail(`${who}: arm (бонус рук) — число от 0 до 3`);
    if (r.evasion !== undefined && !(typeof r.evasion === 'number' && r.evasion >= 0 && r.evasion <= EVASION_CAP)) fail(`${who}: evasion — число от 0 до ${EVASION_CAP}`);
    if (r.apMax !== undefined && !isInt(r.apMax, 1, AP_MAX_CAP)) fail(`${who}: apMax (предел очков действия) — целое от 1 до ${AP_MAX_CAP}`);
    if (r.apCharge !== undefined && !isInt(r.apCharge, 0, AP_CHARGE_CAP)) fail(`${who}: apCharge (подзарядка) — целое от 0 до ${AP_CHARGE_CAP}`);
    return {
        type: r.type,
        pos: { x, z },
        team,
        name: r.name ?? t.name,
        hp: r.hp ?? t.hp,
        ...(mover && { mover }),
        ...(weapon && { weapon }),
        ...(fighter && r.arm !== undefined && { arm: r.arm }),
        ...(fighter && r.evasion !== undefined && { evasion: r.evasion }),
        ...(fighter && r.apMax !== undefined && { apMax: r.apMax }),
        ...(fighter && r.apCharge !== undefined && { apCharge: r.apCharge }),
    };
}

/** Сущность в запись файла: у бойцов всё, у объектов — только то, что отличается от вида. */
function toRecord(e: Entity): EntityRecord {
    const t = entityType(e.type)!;
    const r: EntityRecord = { type: e.type, at: [e.pos.x, e.pos.z] };
    if (e.mover) return { ...r, team: e.team, name: e.name, chassis: e.mover.chassis, move: e.mover.move, up: e.mover.up, down: e.mover.down, hp: e.hp, ...(e.weapon && { weapon: e.weapon }), ...(e.arm !== undefined && { arm: e.arm }), ...(e.evasion !== undefined && { evasion: e.evasion }), ...(e.apMax !== undefined && { apMax: e.apMax }), ...(e.apCharge !== undefined && { apCharge: e.apCharge }) };
    if (e.team !== 'neutral') r.team = e.team;
    if (e.name !== t.name) r.name = e.name;
    if (e.hp !== t.hp) r.hp = e.hp;
    return r;
}

/** Карта и сущности в объект файла. */
export function toMapFile(name: string, map: GridMap, entities: Entity[]): MapFile {
    const rows = (f: (c: Cell) => string): string[] => Array.from({ length: map.d }, (_, z) => Array.from({ length: map.w }, (_, x) => f(map.at(x, z)!)).join(''));
    return {
        version: MAP_VERSION,
        name,
        size: [map.w, map.d],
        height: rows((c) => (c.h * SEGMENTS_PER_LEVEL).toString(36)),
        terrain: rows((c) => TERRAIN_CHAR[c.terrain]),
        slopes: map.cells.filter((c) => c.corners?.some((v) => v)).map((c) => ({ at: [c.x, c.z], corners: c.corners!.join('') })),
        entities: entities.map(toRecord),
    };
}

/** Текст файла: ряды карты, склоны и сущности — по строке на штуку (удобно читать и сравнивать в git). */
export function formatMap(file: MapFile): string {
    const list = (items: unknown[]): string => (items.length ? `[\n${items.map((v) => `        ${JSON.stringify(v)}`).join(',\n')}\n    ]` : '[]');
    return [
        '{',
        `    "version": ${file.version},`,
        `    "name": ${JSON.stringify(file.name)},`,
        `    "size": ${JSON.stringify(file.size)},`,
        `    "height": ${list(file.height)},`,
        `    "terrain": ${list(file.terrain)},`,
        `    "slopes": ${list(file.slopes)},`,
        `    "entities": ${list(file.entities)}`,
        '}',
        '',
    ].join('\n');
}
