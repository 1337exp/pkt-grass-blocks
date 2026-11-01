// Подсказка редактора поверх поля: какой край или угол клетки изменит щелчок инструмента «Склон». Оранжевые ленты в 2 px,
// поверх всего, чтобы не терялись за рельефом.

import * as THREE from 'three';
import type { Cell } from '../../core/grid';
import type { Look } from './look';
import { MARK_COLOR } from './marks';
import type { Metrics } from './metrics';
import { ribbonMaterial, ribbons, type Segment } from './ribbon';

/** Край (dx, dz) — отрезок вдоль него, угол (ix, iz) — уголок из двух плеч по сторонам. */
export type HintTarget = { dx: number; dz: number } | { ix: 0 | 1; iz: 0 | 1 };

export class EditHint {
    private mesh: THREE.Mesh | null = null;
    private readonly material: THREE.ShaderMaterial;

    constructor(
        private readonly root: THREE.Object3D,
        look: Look,
    ) {
        this.material = ribbonMaterial(look, { color: new THREE.Color(MARK_COLOR.attack), opacity: 0.95, lineW: 2, onTop: true });
    }

    /** Подсказка на клетке `c` (null — убрать). */
    set(m: Metrics, c: Cell | null, t: HintTarget | null): void {
        this.clear();
        if (!c || !t) return;
        const p = (ix: number, iz: number): THREE.Vector3 => m.cornerPoint(c, ix, iz).add(new THREE.Vector3(0, 0.012, 0));
        const seg = (a: THREE.Vector3, b: THREE.Vector3): Segment => ({ a: a.toArray() as Segment['a'], b: b.toArray() as Segment['b'], ta: 0, tb: 0 });
        const segs: Segment[] = [];
        if ('dx' in t) {
            // концы стороны: у x± это углы (1 или 0, 0..1), у z± — (0..1, 1 или 0)
            const ends: [number, number][] = t.dx ? [[t.dx > 0 ? 1 : 0, 0], [t.dx > 0 ? 1 : 0, 1]] : [[0, t.dz > 0 ? 1 : 0], [1, t.dz > 0 ? 1 : 0]];
            segs.push(seg(p(...ends[0]!), p(...ends[1]!)));
        } else {
            const corner = p(t.ix, t.iz);
            for (const [ix, iz] of [[1 - t.ix, t.iz], [t.ix, 1 - t.iz]] as const) segs.push(seg(corner, corner.clone().lerp(p(ix, iz), 0.3)));
        }
        this.mesh = ribbons(segs, this.material);
        this.mesh.renderOrder = 4;
        this.root.add(this.mesh);
    }

    clear(): void {
        if (!this.mesh) return;
        this.mesh.geometry.dispose();
        this.mesh.removeFromParent();
        this.mesh = null;
    }

    dispose(): void {
        this.clear();
        this.material.dispose();
    }
}
