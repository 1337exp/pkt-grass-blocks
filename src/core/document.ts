// Файл карты. Одна колонна — одна строка, поэтому правка блока двигает одну строку в git.
//
//   0,0 0:3 grass
//   5,2 0:1 water | 6:8 wood/1100
//
// `y0:y1` — сплошное, верх не включительно. Вертикальная черта — следующий пролёт, между ними воздух.
// `/1100` — подъёмы углов. Нет строки — дыра.

import { defaultMaterial, isMaterialId, materialDelta, type MaterialDef } from './materials';
import { type Corners } from './slope';
import { columnKey, type Prop, type Sky, type Span, type World, WorldError } from './world';

export const WORLD_VERSION = 1;

export interface WorldFile {
    version: number;
    name: string;
    block: number;
    columns: string[];
    props: { id: string; type: string; at: [number, number]; y: number; yaw?: 0 | 1 | 2 | 3 }[];
    sky: Sky;
    materials?: Record<string, { standable?: boolean; liquid?: boolean }>;
}

function fail(msg: string): never {
    throw new WorldError(msg);
}

const isInt = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

function parseSpanToken(token: string, where: string): Span {
    const m = /^(-?\d+):(-?\d+)\s+([a-z][a-z0-9-]*)(?:\/([01]{4}))?$/.exec(token.trim());
    if (!m) fail(`${where}: пролёт «${token.trim()}», жду «0:3 grass» или «0:3 grass/0110»`);
    const y0 = Number(m[1]);
    const y1 = Number(m[2]);
    const material = m[3]!;
    const corners = m[4] ? ([...m[4]].map(Number) as Corners) : undefined;
    if (y1 <= y0) fail(`${where}: пролёт ${y0}:${y1} пустой`);
    return { y0, y1, material, ...(corners?.some((v) => v) ? { corners } : {}) };
}

function parseColumnLine(line: string): { x: number; z: number; spans: Span[] } {
    const parts = line.split('|').map((s) => s.trim()).filter(Boolean);
    if (!parts.length) fail('пустая строка колонны');
    const head = parts[0]!.split(/\s+/);
    const at = /^(-?\d+),(-?\d+)$/.exec(head[0] ?? '');
    if (!at) fail(`колонна «${line}»: в начале нужна клетка x,z`);
    const x = Number(at[1]);
    const z = Number(at[2]);
    const first = `${head.slice(1).join(' ')}`;
    const spans = [parseSpanToken(first, `(${x}, ${z})`), ...parts.slice(1).map((p) => parseSpanToken(p, `(${x}, ${z})`))];
    return { x, z, spans };
}

function formatSpan(s: Span): string {
    const slope = s.corners?.some((v) => v) ? `/${s.corners.join('')}` : '';
    return `${s.y0}:${s.y1} ${s.material}${slope}`;
}

export function formatColumn(x: number, z: number, spans: readonly Span[]): string {
    return `${x},${z} ${spans.map(formatSpan).join(' | ')}`;
}

function sortedColumns(world: World): { x: number; z: number; spans: readonly Span[] }[] {
    const out: { x: number; z: number; spans: readonly Span[] }[] = [];
    for (const [key, spans] of world.columns) {
        const [xs, zs] = key.split(',');
        out.push({ x: Number(xs), z: Number(zs), spans });
    }
    out.sort((a, b) => a.z - b.z || a.x - b.x);
    return out;
}

function materialsBlock(world: World): Record<string, { standable?: boolean; liquid?: boolean }> | null {
    const extra: Record<string, { standable?: boolean; liquid?: boolean }> = {};
    for (const m of world.materials.values()) {
        const delta = materialDelta(m);
        if (delta) extra[m.id] = delta;
    }
    return Object.keys(extra).length ? extra : null;
}

/** Текст файла. Повторный вызов даёт те же байты. */
export function formatWorld(world: World): string {
    const columns = sortedColumns(world).map((c) => formatColumn(c.x, c.z, c.spans));
    const props = [...world.props]
        .sort((a, b) => a.z - b.z || a.x - b.x || a.y - b.y || a.id.localeCompare(b.id))
        .map((p) => ({ id: p.id, type: p.type, at: [p.x, p.z] as [number, number], y: p.y, ...(p.yaw ? { yaw: p.yaw } : {}) }));
    const list = (items: unknown[]): string => (items.length ? `[\n${items.map((v) => `        ${JSON.stringify(v)}`).join(',\n')}\n    ]` : '[]');
    const lines = [
        '{',
        `    "version": ${WORLD_VERSION},`,
        `    "name": ${JSON.stringify(world.name)},`,
        `    "block": ${world.block},`,
        `    "columns": ${list(columns)},`,
        `    "props": ${list(props)},`,
        `    "sky": ${JSON.stringify({ hour: world.sky.hour, cycleHours: world.sky.cycleHours })}`,
    ];
    const materials = materialsBlock(world);
    if (materials) {
        lines[lines.length - 1] += ',';
        lines.push(`    "materials": ${JSON.stringify(materials)}`);
    }
    lines.push('}', '');
    return lines.join('\n');
}

function buildMaterials(extra: WorldFile['materials']): Map<string, MaterialDef> {
    const materials = new Map<string, MaterialDef>();
    for (const base of ['grass', 'dirt', 'rock', 'sand', 'wood', 'water', 'wall']) {
        const m = defaultMaterial(base);
        if (m) materials.set(base, m);
    }
    if (!extra) return materials;
    if (typeof extra !== 'object') fail('materials: жду объект id → флаги');
    for (const [id, flags] of Object.entries(extra)) {
        if (!isMaterialId(id)) fail(`материал «${id}»: id из строчных латинских букв`);
        const base = materials.get(id) ?? { id, standable: true, liquid: false };
        const standable = flags.standable ?? base.standable;
        const liquid = flags.liquid ?? base.liquid;
        if (typeof standable !== 'boolean' || typeof liquid !== 'boolean') fail(`материал «${id}»: standable и liquid — да или нет`);
        materials.set(id, { id, standable, liquid });
    }
    return materials;
}

/** Разбор и проверка файла. Бросает WorldError с местом поломки. */
export function parseWorld(data: unknown): World {
    const f = data as Partial<WorldFile> | null;
    if (!f || typeof f !== 'object') fail('файл пустой или не объект');
    if (f.version !== WORLD_VERSION) fail(`версия ${String(f.version)}, умеем только ${WORLD_VERSION}`);
    const name = typeof f.name === 'string' && f.name.trim() ? f.name.trim() : fail('у карты нет имени');
    const block = typeof f.block === 'number' && f.block > 0 && f.block <= 64 ? f.block : fail('block: метры в ребре блока, число от 0 до 64, не включая 0');
    const materials = buildMaterials(f.materials);
    const columns = new Map<string, Span[]>();
    if (!Array.isArray(f.columns)) fail('columns: список строк колонн');
    for (const line of f.columns) {
        if (typeof line !== 'string') fail('columns: каждая колонна — строка');
        const col = parseColumnLine(line);
        if (!isInt(col.x, -256, 256) || !isInt(col.z, -256, 256)) fail(`клетка (${col.x}, ${col.z}) вне -256…256`);
        const key = columnKey(col.x, col.z);
        if (columns.has(key)) fail(`колонна (${col.x}, ${col.z}) записана дважды`);
        let prevY1 = -1;
        for (const s of col.spans) {
            if (!isInt(s.y0, 0, 128) || !isInt(s.y1, 0, 128)) fail(`(${col.x}, ${col.z}): высота ${s.y0}:${s.y1} вне 0…128`);
            if (s.y0 < prevY1) fail(`(${col.x}, ${col.z}): пролёты пересекаются или идут не снизу вверх`);
            if (!materials.has(s.material)) fail(`(${col.x}, ${col.z}): неизвестный материал «${s.material}»`);
            prevY1 = s.y1;
        }
        columns.set(key, col.spans);
    }
    const props: Prop[] = [];
    const seen = new Set<string>();
    const taken = new Set<string>();
    for (const raw of f.props ?? []) {
        if (!raw || typeof raw !== 'object') fail('проп: жду объект');
        const id = typeof raw.id === 'string' && raw.id ? raw.id : fail('у пропа нет id');
        const type = typeof raw.type === 'string' && raw.type ? raw.type : fail(`проп ${id}: нет вида`);
        if (seen.has(id)) fail(`проп ${id} повторяется`);
        seen.add(id);
        const [x, z] = raw.at ?? [];
        if (!isInt(x, -256, 256) || !isInt(z, -256, 256) || !isInt(raw.y, 0, 128)) fail(`проп ${id}: клетка или высота`);
        const spans = columns.get(columnKey(x, z));
        if (!spans?.some((s) => s.y1 === raw.y)) fail(`проп ${id}: нет площадки (${x}, ${z}) на высоте ${raw.y}`);
        const spot = `${x},${z},${raw.y}`;
        if (taken.has(spot)) fail(`проп ${id}: площадка (${x}, ${z}) на ${raw.y} уже занята`);
        taken.add(spot);
        const yaw = raw.yaw ?? 0;
        if (yaw !== 0 && yaw !== 1 && yaw !== 2 && yaw !== 3) fail(`проп ${id}: yaw — 0, 1, 2 или 3`);
        props.push({ id, type, x, z, y: raw.y, yaw });
    }
    const sky = f.sky;
    if (!sky || typeof sky.hour !== 'number' || typeof sky.cycleHours !== 'number') fail('sky: hour и cycleHours');
    if (sky.hour < 0 || sky.hour > 24 || sky.cycleHours < 0) fail('sky: час 0…24, длина суток не меньше нуля');
    return { name, block, columns, props, sky: { hour: sky.hour % 24, cycleHours: sky.cycleHours }, materials };
}
