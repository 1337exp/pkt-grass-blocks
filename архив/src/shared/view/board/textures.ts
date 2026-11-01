// Текстуры поля: тёмное зерно поверхности (noise-dark.png) и рама подсвеченной клетки (рисуется на canvas).

import * as THREE from 'three';
import noiseUrl from '../assets/noise-dark.png';

/** Зерно поверхности: два почти одинаковых тёмных оттенка, шейдеры растягивают контраст. Повторяется плиткой, это яркость, не цвет. */
export function noiseTexture(): THREE.Texture {
    const noise = new THREE.TextureLoader().load(noiseUrl);
    noise.wrapS = noise.wrapT = THREE.RepeatWrapping;
    noise.colorSpace = THREE.NoColorSpace;
    return noise;
}

/**
 * Рама подсвеченной клетки, как в FM3: серая полоса по краю с зерном (фактура), тонкая светлая кромка и уголки-скобы ярче,
 * в центре дыра. Шейдер тонирует её цветом и приглушает у внутренних стыков; свечение вокруг добавляет блум.
 */
export function frameTexture(): THREE.Texture {
    const S = 128;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(S, S);
    let seed = 1234;
    const rnd = (): number => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const CORNER = 30; // длина скобы угла, px
    for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
            const dx = Math.min(x, S - 1 - x);
            const dy = Math.min(y, S - 1 - y);
            const d = Math.min(dx, dy);
            let v = d < 2 ? 0.75 : 0; // кромка
            v = Math.max(v, 0.38 * Math.exp(-d / 5)); // полоса рамы, гаснет внутрь
            const corner = (dx < CORNER && dy < 5) || (dy < CORNER && dx < 5);
            if (corner) v = Math.max(v, 0.95 * (1 - Math.max(dx, dy) / (CORNER * 1.6)));
            if (Math.max(dx, dy) < CORNER + 6 && d < 9) v = Math.max(v, 0.3 * Math.exp(-d / 4)); // мягкий ореол у скобы
            v *= 0.78 + 0.22 * rnd(); // зерно
            const g = Math.round(Math.min(1, v) * 255);
            const i = (y * S + x) * 4;
            img.data[i] = img.data[i + 1] = img.data[i + 2] = g;
            img.data[i + 3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.NoColorSpace; // это яркость, а не цвет
    tex.anisotropy = 4;
    return tex;
}
