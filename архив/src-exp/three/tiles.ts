// Тайлы граней. Картинки из public/tiles — это и есть текстура куба. Если файла нет, остаётся запасной рисунок в памяти.

import * as THREE from 'three';
import type { FaceKind } from './paint';

const SIZE = 128;
const VARIANTS = 1;

type RGB = [number, number, number];
type Part = 'main' | 'lip';

interface Painter {
    /** x, y внутри колонки варианта. y = 0 у низа грани (v = 0). За краем колонки точка переносится на противоположный, чтобы штрих не рвал шов. */
    set(x: number, y: number, color: RGB, alpha?: number): void;
}

const TILE_FILES: Record<string, string> = {
    'grass:top:main': '/tiles/grass-top.jpg',
    'grass:side:lip': '/tiles/cliff-lip.jpg',
    'grass:side:main': '/tiles/cliff-rock.jpg',
    'grass:bottom:main': '/tiles/cliff-rock.jpg',
    'rock:top:main': '/tiles/cliff-rock.jpg',
    'rock:side:main': '/tiles/cliff-rock.jpg',
    'rock:side:lip': '/tiles/cliff-rock.jpg',
    'rock:bottom:main': '/tiles/cliff-rock.jpg',
    'wood:top:main': '/tiles/wood.jpg',
    'wood:side:main': '/tiles/wood.jpg',
    'wood:bottom:main': '/tiles/wood.jpg',
};

const loader = typeof document === 'undefined' ? null : new THREE.TextureLoader();
const cache = new Map<string, THREE.Texture>();

/** Номер варианта тайла для клетки. Соседние клетки берут разные колонки атласа. */
export function tileVariant(x: number, z: number, salt: number): number {
    let n = Math.imul(x + 1, 374761393) ^ Math.imul(z + 3, 668265263) ^ Math.imul(salt + 1, 1440670057);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) % VARIANTS;
}

/** Локальные 0..1 клетки в колонку атласа. Полпикселя отступа, чтобы линейный фильтр не брал соседний вариант. */
export function atlasUv(variant: number, u: number, v: number): [number, number] {
    const insetU = 0.5 / (SIZE * VARIANTS);
    const insetV = 0.5 / SIZE;
    const span = 1 / VARIANTS - insetU * 2;
    return [variant / VARIANTS + insetU + span * u, insetV + (1 - insetV * 2) * v];
}

/** Карта грани. `lip` — только верхний ряд травы: дёрн нависает на камень. */
export function faceTexture(material: string, kind: FaceKind, part: Part = 'main'): THREE.Texture {
    const key = `${material}:${kind}:${part}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const tex = textureFor(material, kind, part);
    cache.set(key, tex);
    return tex;
}

function textureFor(material: string, kind: FaceKind, part: Part): THREE.Texture {
    const file = TILE_FILES[`${material}:${kind}:${part}`];
    if (file && loader) return loadFile(file);
    if (material === 'grass' && kind === 'top') return atlas(1, drawGrass);
    if (material === 'grass' && kind === 'side' && part === 'lip') return atlas(3, drawLip);
    if ((material === 'grass' && kind !== 'bottom') || material === 'rock') return atlas(3, drawStone);
    if (material === 'dirt' || (material === 'grass' && kind === 'bottom')) return atlas(4, drawDirt);
    if (material === 'sand') return atlas(5, drawSand);
    if (material === 'wood') return atlas(6, kind === 'side' ? drawWoodSide : drawWoodTop);
    if (material === 'water') return atlas(7, drawWater);
    if (material === 'wall') return atlas(8, drawWall);
    return atlas(9, drawStone);
}

function loadFile(url: string): THREE.Texture {
    const tex = loader!.load(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.anisotropy = 8;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
}

function atlas(seedBase: number, draw: (p: Painter, column: number, seed: number) => void): THREE.Texture {
    const width = SIZE * VARIANTS;
    const data = new Uint8Array(width * SIZE * 4);
    for (let column = 0; column < VARIANTS; column++) draw(painter(data, width, column), column, seedBase * 100 + column * 17);
    const tex = new THREE.DataTexture(data, width, SIZE);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
}

function painter(data: Uint8Array, width: number, column: number): Painter {
    return {
        set(x, y, color, alpha = 255) {
            const lx = ((Math.round(x) % SIZE) + SIZE) % SIZE;
            const ly = ((Math.round(y) % SIZE) + SIZE) % SIZE;
            const i = (ly * width + column * SIZE + lx) * 4;
            const t = alpha / 255;
            data[i] = data[i]! * (1 - t) + color[0] * t;
            data[i + 1] = data[i + 1]! * (1 - t) + color[1] * t;
            data[i + 2] = data[i + 2]! * (1 - t) + color[2] * t;
            data[i + 3] = 255;
        },
    };
}

function hash2(x: number, y: number, seed: number): number {
    let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1440670057);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** Шум с периодом SIZE, поэтому левый край тайла сходится с правым, низ с верхом. */
function noise(x: number, y: number, seed: number): number {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const wrap = (v: number) => ((v % SIZE) + SIZE) % SIZE;
    const n = (ix: number, iy: number) => hash2(wrap(ix), wrap(iy), seed);
    const a = n(x0, y0);
    const b = n(x0 + 1, y0);
    const c = n(x0, y0 + 1);
    const d = n(x0 + 1, y0 + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(x: number, y: number, seed: number): number {
    let v = 0;
    let amp = 0.55;
    let freq = 1;
    for (let i = 0; i < 4; i++) {
        v += amp * noise(x * freq, y * freq, seed + i * 17);
        amp *= 0.5;
        freq *= 2;
    }
    return v;
}

function lerp(a: RGB, b: RGB, t: number): RGB {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function drawStone(p: Painter, _column: number, seed: number): void {
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const n = fbm(x * 0.7, y * 0.7, seed);
            let color = lerp([112, 108, 100], [186, 180, 168], n);
            const strata = Math.sin((y / SIZE) * Math.PI * 6 + n * 2);
            if (strata > 0.45) color = lerp(color, [96, 92, 86], 0.28);
            p.set(x, y, color);
        }
    }
    for (let c = 0; c < 4; c++) {
        const x0 = hash2(c, 1, seed) * SIZE;
        const amp = 2 + hash2(c, 2, seed) * 5;
        for (let y = 0; y < SIZE; y++) {
            const x = x0 + Math.sin((y / SIZE) * Math.PI * 2 * (1 + (c % 2))) * amp;
            p.set(x, y, [72, 68, 62], 170);
            p.set(x + 1.4, y, [168, 164, 156], 90);
        }
    }
    for (let c = 0; c < 3; c++) {
        if (hash2(c, 9, seed) < 0.3) continue;
        const x0 = hash2(c, 4, seed) * SIZE;
        const amp = 3 + hash2(c, 5, seed) * 6;
        for (let y = 0; y < SIZE; y++) {
            const x = x0 + Math.sin((y / SIZE) * Math.PI * 2) * amp;
            p.set(x, y, [54, 70, 40], 210);
        }
    }
    for (let i = 0; i < 40; i++) p.set(hash2(i, 6, seed) * SIZE, hash2(i, 7, seed) * SIZE, [210, 206, 196], 140);
}

/** Тот же камень, что у борта ниже: общий seed атласа, сверху только кромка дёрна. */
function drawLip(p: Painter, column: number, seed: number): void {
    drawStone(p, column, seed);
    for (let x = 0; x < SIZE; x++) {
        const depth = SIZE * (0.34 + noise(x * 0.4, 3, seed) * 0.16);
        const edge = SIZE - depth;
        for (let y = Math.floor(edge - 8); y < SIZE; y++) {
            if (y >= edge) p.set(x, y, lerp([62, 118, 40], [158, 204, 86], fbm(x, y, seed + 3)));
            else if (y >= edge - 3) p.set(x, y, [40, 56, 28], 230);
        }
        if (hash2(x, 8, seed) > 0.84) {
            const len = 8 + Math.floor(hash2(x, 11, seed) * 22);
            for (let k = 0; k < len; k++) p.set(x, edge - 4 - k, [58, 102, 40], 230);
        }
    }
}

function drawGrass(p: Painter, column: number, seed: number): void {
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const n = fbm(x * 0.85, y * 0.85, seed);
            p.set(x, y, lerp([78, 138, 46], [154, 198, 78], n));
        }
    }
    for (let i = 0; i < 110; i++) {
        const x = hash2(i, 1, seed) * SIZE;
        const y = hash2(i, 2, seed) * SIZE;
        const len = 3 + hash2(i, 3, seed) * 8;
        const color: RGB = hash2(i, 4, seed) > 0.5 ? [48, 102, 34] : [176, 214, 98];
        for (let k = 0; k < len; k++) p.set(x + Math.sin(k * 0.8) * 0.6, y + k, color, 190);
    }
    if (column % 2 === 1) {
        for (let i = 0; i < 4; i++) {
            const x = hash2(i, 12, seed) * SIZE;
            const y = hash2(i, 13, seed) * SIZE;
            const petal: RGB = i % 2 ? [228, 112, 132] : [236, 210, 112];
            p.set(x, y, [248, 246, 236]);
            p.set(x + 2, y, petal);
            p.set(x - 2, y, petal);
            p.set(x, y + 2, petal);
            p.set(x, y - 2, petal);
        }
    }
}

function drawDirt(p: Painter, _column: number, seed: number): void {
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const n = fbm(x * 0.9, y * 0.9, seed);
            p.set(x, y, lerp([92, 62, 38], [156, 112, 68], n));
        }
    }
    for (let i = 0; i < 30; i++) p.set(hash2(i, 2, seed) * SIZE, hash2(i, 3, seed) * SIZE, [70, 50, 32], 200);
}

function drawSand(p: Painter, _column: number, seed: number): void {
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const n = fbm(x * 0.6, y * 0.6, seed);
            p.set(x, y, lerp([186, 164, 112], [230, 214, 168], n));
        }
    }
    for (let i = 0; i < 50; i++) p.set(hash2(i, 2, seed) * SIZE, hash2(i, 3, seed) * SIZE, [150, 126, 82], 120);
}

function drawWoodTop(p: Painter, _column: number, seed: number): void {
    const plank = 32;
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const gap = y % plank < 2 || (x + Math.floor(y / plank) * 18) % 64 < 2;
            const n = noise(x * 0.5, y * 0.15, seed);
            p.set(x, y, gap ? [96, 64, 38] : lerp([156, 112, 66], [204, 162, 104], n));
        }
    }
}

function drawWoodSide(p: Painter, _column: number, seed: number): void {
    const plank = 32;
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const gap = x % plank < 2 || (y + Math.floor(x / plank) * 18) % 64 < 2;
            const n = noise(x * 0.15, y * 0.5, seed);
            p.set(x, y, gap ? [84, 56, 34] : lerp([132, 92, 54], [176, 132, 82], n));
        }
    }
}

function drawWater(p: Painter, _column: number, seed: number): void {
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const wave = Math.sin((y / SIZE) * Math.PI * 4 + x * 0.05) * 0.5 + 0.5;
            const n = noise(x * 0.4, y * 0.4, seed) * 0.25;
            p.set(x, y, lerp([36, 112, 168], [140, 206, 224], Math.min(1, wave * wave + n)));
        }
    }
}

function drawWall(p: Painter, _column: number, seed: number): void {
    const bh = 16;
    const bw = 32;
    for (let y = 0; y < SIZE; y++) {
        const row = Math.floor(y / bh);
        for (let x = 0; x < SIZE; x++) {
            const lx = (x + (row % 2) * (bw / 2)) % bw;
            const mortar = lx < 2 || y % bh < 2;
            const n = noise(x * 0.8, y * 0.8, seed);
            p.set(x, y, mortar ? [78, 72, 66] : lerp([108, 102, 94], [154, 146, 136], n));
        }
    }
}
