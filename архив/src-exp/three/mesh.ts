// Меш мира: верх пролёта одной гранью, бока — рядами по метру, низ рисуется, если под пролётом воздух.
// Вершины настоящие, поэтому луч Three.js попадает в грань. Наклон запечён в верх, а не сдвинут шейдером.

import * as THREE from 'three';
import { foldDiagonal, type Corners, cornerIndex } from '@core/slope';
import { occupied, spansAt, type World } from '@core/world';
import type { FaceKind } from './paint';
import { atlasUv, faceTexture, tileVariant } from './tiles';

export interface PickFace {
    x: number;
    y: number;
    z: number;
    nx: -1 | 0 | 1;
    ny: -1 | 0 | 1;
    nz: -1 | 0 | 1;
    spanY0: number;
    material: string;
    kind: FaceKind | 'ramp';
}

type Bucket = { pos: number[]; nrm: number[]; uv: number[]; picks: PickFace[] };

const bucket = (): Bucket => ({ pos: [], nrm: [], uv: [], picks: [] });

function tri(b: Bucket, a: number[], c: number[], d: number[], pick: PickFace, uvs: number[]): void {
    const ab = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
    const ac = [d[0]! - a[0]!, d[1]! - a[1]!, d[2]! - a[2]!];
    const n = [ab[1]! * ac[2]! - ab[2]! * ac[1]!, ab[2]! * ac[0]! - ab[0]! * ac[2]!, ab[0]! * ac[1]! - ab[1]! * ac[0]!];
    const len = Math.hypot(n[0]!, n[1]!, n[2]!);
    if (len < 1e-8) return;
    const nn = [n[0]! / len, n[1]! / len, n[2]! / len];
    for (const p of [a, c, d]) {
        b.pos.push(p[0]!, p[1]!, p[2]!);
        b.nrm.push(nn[0]!, nn[1]!, nn[2]!);
    }
    b.uv.push(uvs[0]!, uvs[1]!, uvs[2]!, uvs[3]!, uvs[4]!, uvs[5]!);
    b.picks.push(pick);
}

function quad(b: Bucket, p: number[][], pick: PickFace, uv: number[]): void {
    tri(b, p[0]!, p[1]!, p[2]!, pick, [uv[0]!, uv[1]!, uv[2]!, uv[3]!, uv[4]!, uv[5]!]);
    tri(b, p[0]!, p[2]!, p[3]!, pick, [uv[0]!, uv[1]!, uv[4]!, uv[5]!, uv[6]!, uv[7]!]);
}

function cornerY(y1: number, corners: Corners | undefined, ix: number, iz: number): number {
    return y1 + (corners?.[cornerIndex(ix, iz)] ?? 0);
}

/** Группа мешей. У каждого меша `userData.picks` — грань на треугольник, в том порядке, как их отдаёт луч. */
export function buildWorldMesh(world: World): THREE.Group {
    const s = world.block;
    const buckets = new Map<string, Bucket>();
    const take = (material: string, kind: FaceKind, part: 'main' | 'lip' = 'main'): Bucket => {
        const key = `${material}:${kind}:${part}`;
        let b = buckets.get(key);
        if (!b) buckets.set(key, (b = bucket()));
        return b;
    };
    const grid: number[] = [];
    const P = (x: number, y: number, z: number): number[] => [x * s, y * s, z * s];

    for (const [key, spans] of world.columns) {
        const [xs, zs] = key.split(',');
        const x = Number(xs);
        const z = Number(zs);
        for (const span of spans) {
            const above = occupied(world, x, span.y1, z);
            const below = occupied(world, x, span.y0 - 1, z);
            if (!above) {
                const y = (ix: number, iz: number) => cornerY(span.y1, span.corners, ix, iz);
                const p00 = P(x, y(0, 0), z);
                const p10 = P(x + 1, y(1, 0), z);
                const p11 = P(x + 1, y(1, 1), z + 1);
                const p01 = P(x, y(0, 1), z + 1);
                const pick: PickFace = { x, y: span.y1 - 1, z, nx: 0, ny: 1, nz: 0, spanY0: span.y0, material: span.material, kind: span.corners ? 'ramp' : 'top' };
                const variant = tileVariant(x, z, 1);
                const uv00 = atlasUv(variant, 0, 0);
                const uv10 = atlasUv(variant, 1, 0);
                const uv11 = atlasUv(variant, 1, 1);
                const uv01 = atlasUv(variant, 0, 1);
                const b = take(span.material, 'top');
                // Диагональ сгиба та же, что у правил хода: треугольник не режет выбившийся угол.
                if (foldDiagonal({ x, z, y: span.y1, corners: span.corners }) === 'a') {
                    tri(b, p00, p01, p11, pick, [...uv00, ...uv01, ...uv11]);
                    tri(b, p00, p11, p10, pick, [...uv00, ...uv11, ...uv10]);
                } else {
                    tri(b, p10, p00, p01, pick, [...uv10, ...uv00, ...uv01]);
                    tri(b, p10, p01, p11, pick, [...uv10, ...uv01, ...uv11]);
                }
                insetGrid(grid, s, x, z, y);
            }
            if (!below) {
                const y0 = span.y0;
                const bottom = tileVariant(x, z, 2);
                quad(
                    take(span.material, 'bottom'),
                    [P(x, y0, z), P(x + 1, y0, z), P(x + 1, y0, z + 1), P(x, y0, z + 1)],
                    { x, y: y0, z, nx: 0, ny: -1, nz: 0, spanY0: span.y0, material: span.material, kind: 'bottom' },
                    [...atlasUv(bottom, 0, 0), ...atlasUv(bottom, 1, 0), ...atlasUv(bottom, 1, 1), ...atlasUv(bottom, 0, 1)],
                );
            }
            side(world, x, z, span.y0, span.y1, span, take, P);
            if (span.corners && !above) skirt(x, z, span.y1, span.corners, span, take, P);
        }
    }

    const group = new THREE.Group();
    group.name = 'world';
    for (const [key, b] of buckets) {
        if (!b.pos.length) continue;
        const [material, kind, part] = key.split(':') as [string, FaceKind, 'main' | 'lip'];
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
        const mat = new THREE.MeshStandardMaterial({
            map: faceTexture(material, kind, part),
            color: kind === 'bottom' ? 0x9a9a9a : 0xffffff,
            roughness: material === 'water' ? 0.32 : 0.92,
            metalness: 0,
            flatShading: true,
            ...(material === 'water' ? { transparent: true, opacity: 0.88 } : {}),
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.userData.tile = key;
        mesh.userData.picks = b.picks;
        group.add(mesh);
    }
    if (grid.length) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(grid, 3));
        const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x1d2914, transparent: true, opacity: 0.45 }));
        lines.raycast = () => {};
        group.add(lines);
    }
    return group;
}

function side(world: World, x: number, z: number, y0: number, y1: number, span: { y0: number; material: string; corners?: Corners }, take: (m: string, k: FaceKind, part?: 'main' | 'lip') => Bucket, P: (x: number, y: number, z: number) => number[]): void {
    const faces: { nx: -1 | 1 | 0; nz: -1 | 0 | 1; quad: (y: number) => number[][] }[] = [
        { nx: 1, nz: 0, quad: (y) => [P(x + 1, y, z), P(x + 1, y + 1, z), P(x + 1, y + 1, z + 1), P(x + 1, y, z + 1)] },
        { nx: -1, nz: 0, quad: (y) => [P(x, y, z + 1), P(x, y + 1, z + 1), P(x, y + 1, z), P(x, y, z)] },
        { nx: 0, nz: 1, quad: (y) => [P(x, y, z + 1), P(x + 1, y, z + 1), P(x + 1, y + 1, z + 1), P(x, y + 1, z + 1)] },
        { nx: 0, nz: -1, quad: (y) => [P(x + 1, y, z), P(x, y, z), P(x, y + 1, z), P(x + 1, y + 1, z)] },
    ];
    for (const face of faces) {
        const variant = tileVariant(x, z, face.nx * 3 + face.nz + 8);
        const uv = face.nx !== 0 ? sideUvAcross(variant) : sideUvAlong(variant);
        for (let y = y0; y < y1; y++) {
            if (occupied(world, x + face.nx, y, z + face.nz)) continue;
            // Кромка дёрна только на верхнем ряду и только если этот борт не закрыт юбкой склона.
            const lip = span.material === 'grass' && y === y1 - 1 && !edgeRaised(span.corners, face.nx, face.nz);
            quad(take(span.material, 'side', lip ? 'lip' : 'main'), face.quad(y), { x, y, z, nx: face.nx, ny: 0, nz: face.nz, spanY0: span.y0, material: span.material, kind: 'side' }, uv);
        }
    }
}

/** +X и −X: низ, верх, верх, низ. v = 1 у верха грани. */
function sideUvAcross(variant: number): number[] {
    return [...atlasUv(variant, 0, 0), ...atlasUv(variant, 0, 1), ...atlasUv(variant, 1, 1), ...atlasUv(variant, 1, 0)];
}

/** +Z и −Z: низ, низ, верх, верх. */
function sideUvAlong(variant: number): number[] {
    return [...atlasUv(variant, 0, 0), ...atlasUv(variant, 1, 0), ...atlasUv(variant, 1, 1), ...atlasUv(variant, 0, 1)];
}

function edgeRaised(corners: Corners | undefined, nx: number, nz: number): boolean {
    if (!corners) return false;
    const pts: [number, number][] = nx === 1 ? [[1, 0], [1, 1]] : nx === -1 ? [[0, 0], [0, 1]] : nz === 1 ? [[0, 1], [1, 1]] : [[0, 0], [1, 0]];
    return pts.some(([ix, iz]) => (corners[cornerIndex(ix, iz)] ?? 0) > 0);
}

/**
 * Юбка закрывает борт наклона от низкого верха до поднятых углов. Если поднят один угол, четырёхугольник схлопывается
 * в треугольник, и прежний порядок вершин смотрел нормалью внутрь: грань отсекалась, и сквозь склон был виден фон.
 */
function skirt(x: number, z: number, y1: number, corners: Corners, span: { y0: number; material: string }, take: (m: string, k: FaceKind, part?: 'main' | 'lip') => Bucket, P: (x: number, y: number, z: number) => number[]): void {
    const y = (ix: number, iz: number) => cornerY(y1, corners, ix, iz);
    const walls: { nx: -1 | 0 | 1; nz: -1 | 0 | 1; at: [number, number, number, number] }[] = [
        { nx: 1, nz: 0, at: [1, 0, 1, 1] },
        { nx: -1, nz: 0, at: [0, 1, 0, 0] },
        { nx: 0, nz: 1, at: [0, 1, 1, 1] },
        { nx: 0, nz: -1, at: [1, 0, 0, 0] },
    ];
    for (const wall of walls) {
        const [ix0, iz0, ix1, iz1] = wall.at;
        const h0 = y(ix0!, iz0!);
        const h1 = y(ix1!, iz1!);
        if (h0 <= y1 && h1 <= y1) continue;
        const x0 = x + ix0!;
        const z0 = z + iz0!;
        const x1 = x + ix1!;
        const z1 = z + iz1!;
        const variant = tileVariant(x, z, wall.nx * 3 + wall.nz + 8);
        const uvAt = (u: number, h: number): [number, number] => atlasUv(variant, u, h - y1);
        outwardFace(
            take(span.material, 'side', span.material === 'grass' ? 'lip' : 'main'),
            [
                { p: P(x0, y1, z0), uv: uvAt(0, y1) },
                { p: P(x0, h0, z0), uv: uvAt(0, h0) },
                { p: P(x1, h1, z1), uv: uvAt(1, h1) },
                { p: P(x1, y1, z1), uv: uvAt(1, y1) },
            ],
            [wall.nx, 0, wall.nz],
            { x, y: y1 - 1, z, nx: wall.nx, ny: 0, nz: wall.nz, spanY0: span.y0, material: span.material, kind: 'side' },
        );
    }
}

interface SkirtPoint {
    p: number[];
    uv: [number, number];
}

/** Грань наружу: если нормаль первых трёх точек смотрит против `out`, порядок вершин вместе с uv переворачивается. */
function outwardFace(b: Bucket, pts: SkirtPoint[], out: [number, number, number], pick: PickFace): void {
    const uniq: SkirtPoint[] = [];
    for (const item of pts) {
        const prev = uniq[uniq.length - 1];
        if (prev && Math.hypot(item.p[0]! - prev.p[0]!, item.p[1]! - prev.p[1]!, item.p[2]! - prev.p[2]!) < 1e-5) continue;
        uniq.push(item);
    }
    const first = uniq[0];
    const last = uniq[uniq.length - 1];
    if (first && last && uniq.length > 1 && Math.hypot(first.p[0]! - last.p[0]!, first.p[1]! - last.p[1]!, first.p[2]! - last.p[2]!) < 1e-5) uniq.pop();
    if (uniq.length < 3) return;
    const ab = [uniq[1]!.p[0]! - uniq[0]!.p[0]!, uniq[1]!.p[1]! - uniq[0]!.p[1]!, uniq[1]!.p[2]! - uniq[0]!.p[2]!];
    const ac = [uniq[2]!.p[0]! - uniq[0]!.p[0]!, uniq[2]!.p[1]! - uniq[0]!.p[1]!, uniq[2]!.p[2]! - uniq[0]!.p[2]!];
    const n = [ab[1]! * ac[2]! - ab[2]! * ac[1]!, ab[2]! * ac[0]! - ab[0]! * ac[2]!, ab[0]! * ac[1]! - ab[1]! * ac[0]!];
    const ordered = n[0]! * out[0] + n[1]! * out[1] + n[2]! * out[2] < 0 ? [...uniq].reverse() : uniq;
    const uv = ordered.flatMap((item) => item.uv);
    if (ordered.length === 3) {
        tri(b, ordered[0]!.p, ordered[1]!.p, ordered[2]!.p, pick, uv);
        return;
    }
    quad(b, [ordered[0]!.p, ordered[1]!.p, ordered[2]!.p, ordered[3]!.p], pick, uv);
}

/** Сетка чуть внутри клетки, чтобы общее ребро двух колонн не мерцало. */
function insetGrid(grid: number[], s: number, x: number, z: number, y: (ix: number, iz: number) => number): void {
    const lift = 0.02 * s;
    const pad = 0.08;
    const point = (ix: number, iz: number): number[] => {
        const px = (x + ix) * s;
        const pz = (z + iz) * s;
        return [px + ((x + 0.5) * s - px) * pad, y(ix, iz) * s + lift, pz + ((z + 0.5) * s - pz) * pad];
    };
    const ring = [point(0, 0), point(1, 0), point(1, 1), point(0, 1)];
    for (let i = 0; i < 4; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % 4]!;
        grid.push(a[0]!, a[1]!, a[2]!, b[0]!, b[1]!, b[2]!);
    }
}
