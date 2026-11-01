// Травинки на верхней грани блока: сотни карточек одним вызовом отрисовки (instancing).
// Форма и цвет считаются в шейдере, картинок нет. Раскладка случайная и зависит от зерна (seed).

import * as THREE from 'three';
import { controls } from './controls';
import { tuftFragment, tuftVertex } from './shaders';

const HALF = 0.55;
const RADIUS = 0.13;

/** Общее время для ветра: обновляется из главного цикла. */
export const tuftTime = { value: 0 };

const MAX = 4600;
const RIM_SHARE = 0.3;

interface Patch {
    mesh: THREE.Mesh<THREE.InstancedBufferGeometry>;
    /** Перекладывает травинки заново под новое зерно. */
    scatter: (seed: number) => void;
}
const patches: Patch[] = [];

/** Густота травы от 0 до 1 от максимума. Травинки лежат вперемешку, поэтому обрезка по счёту равномерна. */
export function setTuftDensity(density: number): void {
    const count = Math.round(MAX * THREE.MathUtils.clamp(density, 0, 1));
    for (const { mesh } of patches) mesh.geometry.instanceCount = count;
}

/** Новое зерно: вся трава раскладывается заново. У каждого блока своё смещение, поэтому блоки не повторяют друг друга. */
export function setTuftSeed(seed: number): void {
    for (const { scatter } of patches) scatter(seed);
}

function rng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** На сколько округлая кромка шапки ниже плоского верха на расстоянии `edge` от края. */
function drop(edge: number): number {
    if (edge >= RADIUS) return 0;
    const k = RADIUS - edge;
    return RADIUS - Math.sqrt(Math.max(0, RADIUS * RADIUS - k * k));
}

/** Травинки блока 1×1. `tint` — множитель цвета блока. `blockSeed` разводит блоки, зерно из ползунка меняет раскладку у всех сразу. */
export function createTufts(
    top: number,
    tint: { value: THREE.Vector3 },
    blockSeed = 0,
    seed = 0,
    density = 0.61,
): THREE.Mesh {
    const origin = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    const shape = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
    const grain = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);

    const scatter = (s: number): void => {
        const rand = rng(7 + blockSeed * 7919 + s * 104729);
        for (let i = 0; i < MAX; i++) {
            let x = (rand() * 2 - 1) * HALF;
            let z = (rand() * 2 - 1) * HALF;
            const isRim = i % 10 < RIM_SHARE * 10;
            if (isRim) {
                // Вдоль кромки: так силуэт щетинится.
                const side = Math.floor(rand() * 4);
                const along = (rand() * 2 - 1) * HALF;
                const out = HALF - rand() * 0.09;
                [x, z] = side === 0 ? [out, along] : side === 1 ? [-out, along] : side === 2 ? [along, out] : [along, -out];
            }
            const edge = HALF - Math.max(Math.abs(x), Math.abs(z));
            origin.setXYZ(i, x, top - drop(edge) - 0.015, z);

            const height = 0.07 + rand() * 0.1;
            const outward = isRim ? 0.25 + rand() * 0.3 : 0;
            const lx = Math.sign(x) * outward * (Math.abs(x) > Math.abs(z) ? 1 : 0.2) + (rand() - 0.5) * 0.5;
            const lz = Math.sign(z) * outward * (Math.abs(z) >= Math.abs(x) ? 1 : 0.2) + (rand() - 0.5) * 0.5;
            shape.setXYZW(i, 0.045 + rand() * 0.04, height, lx, lz);
            grain.setX(i, rand());
        }
        origin.needsUpdate = true;
        shape.needsUpdate = true;
        grain.needsUpdate = true;
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
    geo.instanceCount = Math.round(MAX * density);

    const mat = new THREE.ShaderMaterial({
        vertexShader: tuftVertex,
        fragmentShader: tuftFragment,
        side: THREE.DoubleSide,
        uniforms: {
            uTime: tuftTime,
            uWind: controls.wind,
            uTint: tint,
            uBase: { value: new THREE.Color(0x3f7f18) },
            uMid: { value: new THREE.Color(0x84c02a) },
            uTip: { value: new THREE.Color(0xc4e84a) },
            uEdge: { value: new THREE.Color(0x2f5a14) },
        },
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    patches.push({ mesh, scatter });
    return mesh;
}
