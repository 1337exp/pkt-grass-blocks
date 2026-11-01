// Правки мира: чистые функции. Старый мир не меняется, история редактора хранит текст файла.

import { isMaterialId } from './materials';
import { type Corners, cornersEqual } from './slope';
import { columnKey, createReadyWorld, type Prop, type Sky, type Span, spansAt, type World, WorldError } from './world';

const MIN_XZ = -256;
const MAX_XZ = 256;
const MAX_Y = 128;

const inXz = (n: number): boolean => Number.isInteger(n) && n >= MIN_XZ && n <= MAX_XZ;
const inY = (n: number): boolean => Number.isInteger(n) && n >= 0 && n <= MAX_Y;

function cloneSpans(spans: readonly Span[]): Span[] {
    return spans.map((s) => ({ ...s, ...(s.corners ? { corners: [...s.corners] as Corners } : {}) }));
}

/** Склеивает соприкасающиеся пролёты одного материала. У нижнего не должно быть наклона: наклон занимает блок воздуха над ним. */
export function normalizeSpans(spans: readonly Span[]): Span[] {
    const sorted = cloneSpans(spans).sort((a, b) => a.y0 - b.y0 || a.y1 - b.y1);
    const out: Span[] = [];
    for (const s of sorted) {
        if (!inY(s.y0) || !inY(s.y1) || s.y1 <= s.y0) throw new WorldError(`пролёт ${s.y0}:${s.y1} пустой или вне 0…${MAX_Y}`);
        const prev = out[out.length - 1];
        if (!prev) {
            out.push(s);
            continue;
        }
        if (s.y0 < prev.y1) {
            if (s.material !== prev.material) throw new WorldError(`пролёты ${prev.material} и ${s.material} пересекаются`);
            prev.y1 = Math.max(prev.y1, s.y1);
            if (s.corners) prev.corners = s.corners;
            continue;
        }
        if (s.y0 === prev.y1 && s.material === prev.material && !prev.corners) {
            prev.y1 = s.y1;
            prev.corners = s.corners;
            continue;
        }
        out.push(s);
    }
    return out;
}

function pruneProps(props: readonly Prop[], x: number, z: number, spans: readonly Span[]): Prop[] {
    const tops = new Set(spans.map((s) => s.y1));
    return props.filter((p) => p.x !== x || p.z !== z || tops.has(p.y));
}

function withColumn(world: World, x: number, z: number, spans: readonly Span[]): World {
    if (!inXz(x) || !inXz(z)) throw new WorldError(`клетка (${x}, ${z}) вне ${MIN_XZ}…${MAX_XZ}`);
    const next = normalizeSpans(spans);
    const columns = new Map(world.columns);
    if (next.length) columns.set(columnKey(x, z), next);
    else columns.delete(columnKey(x, z));
    return { ...world, columns, props: pruneProps(world.props, x, z, next) };
}

function assertMaterial(world: World, material: string): void {
    if (!isMaterialId(material) || !world.materials.has(material)) throw new WorldError(`неизвестный материал «${material}»`);
}

/** Ставит один блок. Соседний пролёт того же материала впитывает его. Наклон под новым блоком снимается. */
export function fillBlock(world: World, x: number, z: number, y: number, material: string): World {
    if (!inY(y)) return world;
    if (spansAt(world, x, z).some((s) => y >= s.y0 && y < s.y1)) return world;
    assertMaterial(world, material);
    const spans = cloneSpans(spansAt(world, x, z)).map((s) => (s.y1 === y && s.corners ? { ...s, corners: undefined } : s));
    spans.push({ y0: y, y1: y + 1, material });
    return withColumn(world, x, z, spans);
}

/** Снимает один блок. Дырка в середине пролёта делит его на два: так получается воздух под мостом в той же клетке. */
export function eraseBlock(world: World, x: number, z: number, y: number): World {
    const spans = spansAt(world, x, z);
    const span = spans.find((s) => y >= s.y0 && y < s.y1);
    if (!span) return world;
    const kept = spans.filter((s) => s !== span);
    const topBlock = y === span.y1 - 1;
    const corners = topBlock ? undefined : span.corners;
    if (y > span.y0) kept.push({ y0: span.y0, y1: y, material: span.material });
    if (y + 1 < span.y1) kept.push({ y0: y + 1, y1: span.y1, material: span.material, ...(corners ? { corners } : {}) });
    return withColumn(world, x, z, kept);
}

/** Поднимает или опускает верхний пролёт на один блок. Пустая колонна от подъёма не появляется. */
export function shiftTop(world: World, x: number, z: number, dy: -1 | 1, material = 'grass'): World {
    const spans = cloneSpans(spansAt(world, x, z));
    const top = spans[spans.length - 1];
    if (!top) {
        if (dy < 0) return world;
        assertMaterial(world, material);
        return withColumn(world, x, z, [{ y0: 0, y1: 1, material }]);
    }
    const oldTop = top.y1;
    if (dy > 0) {
        if (top.y1 >= MAX_Y) return world;
        top.y1 += 1;
    } else if (top.y1 - top.y0 === 1) {
        spans.pop();
    } else {
        top.y1 -= 1;
    }
    const newTop = spans[spans.length - 1]?.y1;
    const props = newTop !== undefined && newTop !== oldTop
        ? world.props.map((p) => (p.x === x && p.z === z && p.y === oldTop ? { ...p, y: newTop } : p))
        : world.props;
    return withColumn({ ...world, props }, x, z, spans);
}

/** Красит пролёт, чей низ `y0`. Сосед того же материала после этого сливается с ним. */
export function paintSpan(world: World, x: number, z: number, y0: number, material: string): World {
    assertMaterial(world, material);
    const spans = cloneSpans(spansAt(world, x, z));
    const span = spans.find((s) => s.y0 === y0);
    if (!span || span.material === material) return world;
    span.material = material;
    return withColumn(world, x, z, spans);
}

/** Ставит наклон верхней грани пролёта. Над пролётом должен быть свободный блок, иначе наклону некуда подняться. */
export function setCorners(world: World, x: number, z: number, y0: number, corners: Corners | null): World {
    const spans = cloneSpans(spansAt(world, x, z));
    const span = spans.find((s) => s.y0 === y0);
    if (!span) return world;
    if (corners?.some((v) => v !== 0 && v !== 1)) throw new WorldError('угол поднимается на 0 или 1 блок');
    const lift = corners?.some((v) => v) ?? false;
    if (lift && spans.some((s) => s.y0 !== span.y0 && s.y0 <= span.y1 && s.y1 > span.y1)) return world;
    if (cornersEqual(span.corners, corners ?? undefined)) return world;
    if (lift && corners) span.corners = [...corners] as Corners;
    else delete span.corners;
    return withColumn(world, x, z, spans);
}

export function setName(world: World, name: string): World {
    const next = name.trim();
    if (!next || next === world.name) return world;
    return { ...world, name: next };
}

export function setSky(world: World, sky: Sky): World {
    const hour = ((sky.hour % 24) + 24) % 24;
    const cycleHours = Math.max(0, sky.cycleHours);
    if (hour === world.sky.hour && cycleHours === world.sky.cycleHours) return world;
    return { ...world, sky: { hour, cycleHours } };
}

/** Один предмет на площадку: прежний на той же клетке и высоте заменяется. */
export function putProp(world: World, prop: Prop): World {
    if (!spansAt(world, prop.x, prop.z).some((s) => s.y1 === prop.y)) return world;
    const props = world.props.filter((p) => !(p.x === prop.x && p.z === prop.z && p.y === prop.y));
    return { ...world, props: [...props, { ...prop }] };
}

export function removePropAt(world: World, x: number, z: number, y: number): World {
    const props = world.props.filter((p) => !(p.x === x && p.z === z && p.y === y));
    if (props.length === world.props.length) return world;
    return { ...world, props };
}

/** Прямоугольник колонн одного пролёта от пола `y0` до верха `y1`. Удобно собирать образец. */
export function fillRect(world: World, x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, material: string): World {
    let next = world.materials.size ? world : createReadyWorld(world.name);
    for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
            for (let y = y0; y < y1; y++) next = fillBlock(next, x, z, y, material);
        }
    }
    return next;
}
