// «Врастание в землю»: низ фигуры темнее, верх светлее — тот же язык, что у боков столбиков поля (shaders/sides.ts, книзу до
// трети яркости). Делается вершинными цветами по высоте над ногами: материал с `vertexColors: true` их перемножает с цветом,
// а свечение (emissive: пояс, визор) они не трогают.

import * as THREE from 'three';

/** Яркость у самой земли (поле: 0,35). */
const FOOT = 0.4;

/**
 * Записать в геометрию цвета-множители по высоте. `baseY` — высота центра геометрии над ногами фигуры,
 * `height` — рост фигуры: на нём (и выше) яркость полная.
 */
export function fadeToGround(geo: THREE.BufferGeometry, baseY: number, height: number): void {
    const pos = geo.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
        const t = THREE.MathUtils.smoothstep(baseY + pos.getY(i), 0, height);
        colors.fill(THREE.MathUtils.lerp(FOOT, 1, t), i * 3, i * 3 + 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}
