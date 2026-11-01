// Курсор на поле: рамка-индикатор «потоки» на клетке под мышью (cellFrame). Везде зелёный, как квадрат-цель во FM3: на бирюзовом и
// оранжевом радиусе он главнее фона, а серебро маяков пути (PLAIN_COLOR) от него отличается. Окраску над целью пути оставили на
// будущее, для особых случаев (TINT_GOAL).

import * as THREE from 'three';
import { type Cell, foldDiagonal } from '../../core/grid';
import { ORANGE, SELECT_GREEN } from '../colors';
import { cellQuadGeometry } from './geometry';
import type { Metrics } from './metrics';
import { cursorFrag, cursorVert } from './shaders/cursor';

/** Красить ли курсор над целью пути (пока нет: см. начало файла). */
const TINT_GOAL = false;
/** Над целью пути, если красим: цвет своих, чуть ярче рамы радиуса. */
const GOAL_COLOR = new THREE.Color(ORANGE).multiplyScalar(1.1);
/** Нейтральное серебро, ярче сетки: огоньки-маяки пути (marks.ts). */
export const PLAIN_COLOR = new THREE.Color(0xc8d0da).multiplyScalar(0.85);
/** Курсор: зелёный квадрат-цель, как во FM3 (ярче сетки, как и раньше серебро). */
export const CURSOR_COLOR = new THREE.Color(SELECT_GREEN).multiplyScalar(0.85);

export class Cursor {
    readonly mesh: THREE.InstancedMesh;
    private readonly material: THREE.ShaderMaterial;
    private readonly corners: THREE.InstancedBufferAttribute;
    private readonly diag: THREE.InstancedBufferAttribute;

    constructor(px: { value: number }) {
        this.material = new THREE.ShaderMaterial({
            vertexShader: cursorVert,
            fragmentShader: cursorFrag,
            uniforms: { uTime: { value: 0 }, uPx: px, uColor: { value: CURSOR_COLOR.clone() } },
            transparent: true,
            // как подсветка: свет поверх, под тёмной обводкой то, что ниже, гаснет (премультиплированное «over»)
            blending: THREE.CustomBlending,
            blendSrc: THREE.OneFactor,
            blendDst: THREE.OneMinusSrcAlphaFactor,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -3,
        });
        const g = cellQuadGeometry();
        this.corners = new THREE.InstancedBufferAttribute(new Float32Array(4), 4);
        this.diag = new THREE.InstancedBufferAttribute(new Float32Array(1), 1);
        g.setAttribute('aCorners', this.corners);
        g.setAttribute('aDiag', this.diag);
        this.mesh = new THREE.InstancedMesh(g, this.material, 1);
        this.mesh.visible = false;
        this.mesh.renderOrder = 2;
        this.mesh.frustumCulled = false;
        this.mesh.raycast = () => {};
    }

    /** На клетку `c` (null — спрятать); `goal` — это цель пути. */
    set(m: Metrics, c: Cell | null, goal: boolean): void {
        this.mesh.visible = c !== null;
        if (!c) return;
        this.mesh.setMatrixAt(0, m.topMatrix(c, 0.008));
        this.mesh.instanceMatrix.needsUpdate = true;
        this.corners.set(m.cornerOffsets(c));
        this.corners.needsUpdate = true;
        this.diag.setX(0, foldDiagonal(c) === 'b' ? 1 : 0);
        this.diag.needsUpdate = true;
        (this.material.uniforms.uColor!.value as THREE.Color).copy(goal && TINT_GOAL ? GOAL_COLOR : CURSOR_COLOR);
    }

    update(time: number): void {
        this.material.uniforms.uTime!.value = time;
    }

    dispose(): void {
        this.mesh.geometry.dispose();
        this.material.dispose();
    }
}
