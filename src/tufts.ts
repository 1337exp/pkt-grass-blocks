// Травинки на верхних гранях карты: сотни карточек одним вызовом отрисовки (instancing).
// Форма и цвет считаются в шейдере, картинок нет. Раскладка случайная и зависит от зерна (seed).

import * as THREE from 'three';
import { mulberry32 } from '@1337exp/pkt-threejs-blueprint/rng';
import { controls } from './controls';
import { tuftFragment, tuftVertex } from './shaders';
import { type HeightMap, LEVEL, type Sides, drop, exposure, floorOf, heightAt, occlusion, reflexCorners, shaded } from './skin';

const RADIUS = 0.13;

/** Общее время для ветра: обновляется из главного цикла. */
export const tuftTime = { value: 0 };

/** Травинок на клетку при густоте 1. */
const PER_CELL = 4600;
const RIM_SHARE = 0.3;

interface Patch {
    mesh: THREE.Mesh<THREE.InstancedBufferGeometry>;
    total: number;
    /** Перекладывает травинки заново под новое зерно. */
    scatter: (seed: number) => void;
}
const patches: Patch[] = [];

/** Густота травы от 0 до 1 от максимума. Травинки лежат вперемешку по клеткам, поэтому обрезка по счёту равномерна. */
export function setTuftDensity(density: number): void {
    const k = THREE.MathUtils.clamp(density, 0, 1);
    for (const { mesh, total } of patches) mesh.geometry.instanceCount = Math.round(total * k);
}

/** Новое зерно: вся трава раскладывается заново. */
export function setTuftSeed(seed: number): void {
    for (const { scatter } of patches) scatter(seed);
}

interface Cell {
    id: number;
    top: number;
    xmin: number;
    xmax: number;
    zmin: number;
    zmax: number;
    /** Открытые стороны как направления наружу: расстояние до края считается по границам клетки. */
    open: { dx: number; dz: number }[];
    /** Внутренние углы обрыва, верх вокруг них скруглён по расстоянию до точки. */
    corners: { x: number; z: number }[];
    x0: number;
    z0: number;
    shaded: Sides;
}

function cells(m: HeightMap, pad: number, lift: number): Cell[] {
    const out: Cell[] = [];
    for (let j = 0; j < m.d; j++) {
        for (let i = 0; i < m.w; i++) {
            const h = heightAt(m, i, j);
            if (h <= 0) continue;
            const ex = exposure(m, i, j);
            const x0 = i - m.w / 2;
            const z0 = j - m.d / 2;
            const open: Cell['open'] = [];
            if (ex.e) open.push({ dx: 1, dz: 0 });
            if (ex.w) open.push({ dx: -1, dz: 0 });
            if (ex.s) open.push({ dx: 0, dz: 1 });
            if (ex.n) open.push({ dx: 0, dz: -1 });
            out.push({
                id: j * m.w + i,
                top: h * LEVEL + lift,
                xmin: x0 - (ex.w ? pad : 0),
                xmax: x0 + 1 + (ex.e ? pad : 0),
                zmin: z0 - (ex.n ? pad : 0),
                zmax: z0 + 1 + (ex.s ? pad : 0),
                open,
                corners: reflexCorners(m, i, j, pad),
                x0,
                z0,
                shaded: shaded(m, i, j),
            });

            // Пол под открытой колонкой: на нём тоже растёт трава, она видна у скруглённых углов.
            const base = floorOf(m, i, j);
            if (base) {
                out.push({
                    id: base.j * m.w + base.i,
                    top: base.level * LEVEL + lift,
                    xmin: x0,
                    xmax: x0 + 1,
                    zmin: z0,
                    zmax: z0 + 1,
                    open: [],
                    corners: [],
                    x0,
                    z0,
                    shaded: { w: false, e: false, n: false, s: false },
                });
            }
        }
    }
    return out;
}

/** Травинки всей карты. `pad` и `lift` те же, что у оболочки, чтобы травинки сидели на её поверхности. */
export function createTufts(m: HeightMap, pad: number, lift: number, seed = 0, density = 0.6): THREE.Mesh {
    const list = cells(m, pad, lift);
    const total = list.length * PER_CELL;
    const origin = new THREE.InstancedBufferAttribute(new Float32Array(total * 3), 3);
    const shape = new THREE.InstancedBufferAttribute(new Float32Array(total * 4), 4);
    const grain = new THREE.InstancedBufferAttribute(new Float32Array(total), 1);
    const cellId = new THREE.InstancedBufferAttribute(new Float32Array(total), 1);
    const shade = new THREE.InstancedBufferAttribute(new Float32Array(total), 1);

    const scatter = (s: number): void => {
        const rand = mulberry32(7 + s * 104729);
        // Порядок «слой за слоем по всем клеткам»: обрезка по густоте снимает травинки равномерно с каждой клетки.
        for (let k = 0; k < PER_CELL; k++) {
            for (let c = 0; c < list.length; c++) {
                const cell = list[c]!;
                const idx = k * list.length + c;
                let x = cell.xmin + rand() * (cell.xmax - cell.xmin);
                let z = cell.zmin + rand() * (cell.zmax - cell.zmin);
                let lx = (rand() - 0.5) * 0.5;
                let lz = (rand() - 0.5) * 0.5;

                if (k % 10 < RIM_SHARE * 10 && cell.open.length > 0) {
                    // Вдоль открытой кромки: так силуэт щетинится, и травинки клонятся наружу.
                    const side = cell.open[Math.floor(rand() * cell.open.length)]!;
                    const out = 0.25 + rand() * 0.3;
                    const away = rand() * 0.09;
                    if (side.dx !== 0) x = side.dx > 0 ? cell.xmax - away : cell.xmin + away;
                    else z = side.dz > 0 ? cell.zmax - away : cell.zmin + away;
                    lx += side.dx * out;
                    lz += side.dz * out;
                }

                let edge = Infinity;
                for (const side of cell.open) {
                    edge = Math.min(edge, side.dx > 0 ? cell.xmax - x : side.dx < 0 ? x - cell.xmin : side.dz > 0 ? cell.zmax - z : z - cell.zmin);
                }
                for (const c of cell.corners) edge = Math.min(edge, Math.hypot(x - c.x, z - c.z));
                origin.setXYZ(idx, x, cell.top - drop(edge, RADIUS) - 0.015, z);
                shade.setX(idx, occlusion(cell.x0, cell.z0, cell.shaded, pad, x, z));
                shape.setXYZW(idx, 0.045 + rand() * 0.04, 0.07 + rand() * 0.1, lx, lz);
                grain.setX(idx, rand());
                cellId.setX(idx, cell.id);
            }
        }
        origin.needsUpdate = true;
        shape.needsUpdate = true;
        grain.needsUpdate = true;
        cellId.needsUpdate = true;
        shade.needsUpdate = true;
    };
    scatter(seed);

    const quad = new THREE.PlaneGeometry(1, 1, 1, 5);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    geo.setAttribute('uv', quad.getAttribute('uv'));
    geo.setAttribute('aOrigin', origin);
    geo.setAttribute('aShape', shape);
    geo.setAttribute('aSeed', grain);
    geo.setAttribute('aCell', cellId);
    geo.setAttribute('aShade', shade);
    geo.instanceCount = Math.round(total * density);

    const mat = new THREE.ShaderMaterial({
        vertexShader: tuftVertex,
        fragmentShader: tuftFragment,
        side: THREE.DoubleSide,
        uniforms: {
            uTime: tuftTime,
            uWind: controls.wind,
            uSeed: controls.seed,
            uVariation: controls.variation,
            uShadow: controls.shadow,
            uBase: { value: new THREE.Color(0x3f7f18) },
            uMid: { value: new THREE.Color(0x84c02a) },
            uTip: { value: new THREE.Color(0xc4e84a) },
            uEdge: { value: new THREE.Color(0x2f5a14) },
        },
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    patches.push({ mesh, total, scatter });
    return mesh;
}
