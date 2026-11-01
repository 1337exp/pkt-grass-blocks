// Линии-ленты поля (shaders/edges.ts): отрезки полосами, развёрнутыми поперёк экрана, одной толщины в пикселях при любом
// масштабе. Ими нарисованы края уступов, вертикали и подсказка редактора.

import * as THREE from 'three';
import type { Look } from './look';
import { ribbonFrag, ribbonVert } from './shaders/edges';

/** Отрезок ленты: концы и доля длины у каждого (для затухания вертикалей). */
export interface Segment {
    a: [number, number, number];
    b: [number, number, number];
    ta: number;
    tb: number;
}

/** Ленты из отрезков (см. ribbonVert): по четыре вершины на отрезок, ширину и разворот к экрану задаёт шейдер. */
export function ribbons(segs: Segment[], material: THREE.Material): THREE.Mesh {
    const pos: number[] = [];
    const other: number[] = [];
    const rib: number[] = [];
    const t: number[] = [];
    const index: number[] = [];
    let v = 0;
    for (const { a, b, ta, tb } of segs) {
        pos.push(...a, ...a, ...b, ...b);
        other.push(...b, ...b, ...a, ...a);
        rib.push(-1, 0, 1, 0, -1, 1, 1, 1);
        t.push(ta, ta, tb, tb);
        index.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
        v += 4;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aOther', new THREE.Float32BufferAttribute(other, 3));
    g.setAttribute('aRib', new THREE.Float32BufferAttribute(rib, 2));
    g.setAttribute('aT', new THREE.Float32BufferAttribute(t, 1));
    g.setIndex(index);
    const mesh = new THREE.Mesh(g, material);
    mesh.frustumCulled = false;
    mesh.raycast = () => {};
    return mesh;
}

/**
 * Материал лент. По умолчанию — края уступов (цвет и прозрачность крестиков сетки, 1 px): лента лежит на ребре верха клетки,
 * и половина её ширины приходится на саму грань — сдвиг глубины к камере, чтобы грань не закрывала её (мерцание). `fade` 1 —
 * гаснет книзу (вертикали); `onTop` — рисуется поверх всего (подсказка редактора).
 */
export function ribbonMaterial(look: Look, opts: { color?: THREE.Color; opacity?: number; lineW?: number; fade?: number; onTop?: boolean } = {}): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        vertexShader: ribbonVert,
        fragmentShader: ribbonFrag,
        uniforms: {
            uColor: opts.color ? { value: opts.color } : look.edgeColor,
            uOpacity: opts.opacity !== undefined ? { value: opts.opacity } : look.edgeOpacity,
            uLineW: opts.lineW !== undefined ? { value: opts.lineW } : look.lineW,
            uFade: { value: opts.fade ?? 0 },
            uAppear: { value: 1 },
            ...look.view,
        },
        transparent: true,
        depthWrite: false,
        depthTest: !opts.onTop,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -4,
    });
}
