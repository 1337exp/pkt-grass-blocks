// Подсветка клеток: радиус хода (свои, чужие), путь и цель. Рама из текстуры, узлы в углах, волна проявления от юнита (по цене
// пути), пульс пути. Внешний контур радиуса ярче внутренних стыков: каждая клетка знает, какие соседи того же вида.

import * as THREE from 'three';
import { foldDiagonal, type GridMap } from '../../core/grid';
import { MOVE_COLOR, ORANGE, TEAM_COLOR } from '../colors';
import { PLAIN_COLOR } from './cursor';
import { cellQuadGeometry } from './geometry';
import type { Metrics } from './metrics';
import { markFrag, markVert } from './shaders/marks';
import { frameTexture } from './textures';

export type Mark = 'move' | 'attack' | 'enemy' | 'path' | 'goal' | 'brush';

/**
 * Два слоя подсветки, как во FM3: куда можно пойти (бирюзовый) и куда достаёт оружие (оранжевый, цвет своих). Чужие зелёные, путь
 * почти белый. Цвета выровнены по яркости (colors.ts).
 */
export const MARK_COLOR: Record<Mark, number> = {
    move: MOVE_COLOR,
    attack: ORANGE,
    enemy: TEAM_COLOR.enemy,
    path: 0xffe7b0,
    // цель — клетка пути (того же вида), а выбранную клетку отмечает курсор (cursor.ts)
    goal: 0xffe7b0,
    // след кисти редактора: рама, как у радиуса, но серебряная, в цвет курсора — видно, какие клетки меняешь
    brush: 0xc8d0da,
};
/** Ядро узла в углу: на оранжевом радиусе зеленоватое (как в FM3), на бирюзовом в цвет самой клетки, без белого. */
const NODE_COLOR: Record<Mark, number> = {
    move: MOVE_COLOR, // ядро в цвет самой клетки, без белого
    attack: 0x5dff95,
    enemy: 0xffd36a,
    path: 0xffffff,
    goal: 0xffffff,
    brush: 0xffffff,
};
/** Яркость пути относительно радиуса: читается, но не светит фонарём (было 0,81, потом −5%, −20% и −30%); узлы пути гаснут так же. Цель — та же клетка пути. */
const PATH_DIM: Partial<Record<Mark, number>> = { path: 0.43, goal: 0.43, brush: 0.7 };

export interface MarkCell {
    i: number;
    mark: Mark;
    /** Расстояние от юнита (цена пути): по нему идёт волна проявления. */
    dist: number;
}

export class MarkLayer {
    readonly material: THREE.ShaderMaterial;
    mesh: THREE.InstancedMesh;
    private attr!: Record<'color' | 'edges' | 'dist' | 'pulse' | 'node' | 'corners' | 'diag', THREE.InstancedBufferAttribute>;
    /** Когда (с, время поля) начали проявлять нынешний радиус, и какой он: смена пути под курсором волну не перезапускает. */
    private shownAt = 0;
    private key = '';

    constructor(private m: Metrics) {
        this.material = new THREE.ShaderMaterial({
            vertexShader: markVert,
            fragmentShader: markFrag,
            uniforms: { uTime: { value: 0 }, uShown: { value: 0 }, uCenter: { value: new THREE.Vector2() }, uHasCenter: { value: 0 }, uFrame: { value: frameTexture() }, uDotColor: { value: PLAIN_COLOR } },
            transparent: true,
            // свет поверх: цвет прибавляется, а то, что под ним, гаснет на долю альфы (премультиплированное «over»)
            blending: THREE.CustomBlending,
            blendSrc: THREE.OneFactor,
            blendDst: THREE.OneMinusSrcAlphaFactor,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -2,
        });
        this.mesh = this.build();
    }

    /** Новая метрика (пересборка поля): меш на нужное число клеток, подсветка сброшена. */
    rebuild(m: Metrics): void {
        this.mesh.geometry.dispose();
        const parent = this.mesh.parent;
        this.mesh.removeFromParent();
        this.m = m;
        this.mesh = this.build();
        parent?.add(this.mesh);
        this.key = '';
    }

    private build(): THREE.InstancedMesh {
        const n = this.m.map.cells.length;
        const g = cellQuadGeometry();
        const a = (size: number): THREE.InstancedBufferAttribute => new THREE.InstancedBufferAttribute(new Float32Array(n * size), size).setUsage(THREE.DynamicDrawUsage);
        this.attr = { color: a(3), edges: a(1), dist: a(1), pulse: a(1), node: a(3), corners: a(4), diag: a(1) };
        g.setAttribute('aColor', this.attr.color);
        g.setAttribute('aEdges', this.attr.edges);
        g.setAttribute('aDist', this.attr.dist);
        g.setAttribute('aPulse', this.attr.pulse);
        g.setAttribute('aNode', this.attr.node);
        g.setAttribute('aCorners', this.attr.corners);
        g.setAttribute('aDiag', this.attr.diag);
        const mesh = new THREE.InstancedMesh(g, this.material, n);
        mesh.count = 0;
        mesh.renderOrder = 1;
        mesh.frustumCulled = false;
        mesh.raycast = () => {};
        return mesh;
    }

    /** Подсветка клеток; `key` меняется только при новом радиусе (тогда волна запускается заново), `time` — время поля. */
    set(list: MarkCell[], key: string, time: number, origin: number | null = null): void {
        const map: GridMap = this.m.map;
        const color = new THREE.Color();
        // соседей считаем внутри одного вида и одного слоя: радиус (свои, чужие) отдельно от пути (путь и цель — один вид).
        // Путь лежит поверх радиуса на тех же клетках и раму радиуса под собой не трогает
        const isPath = (mark: Mark): boolean => mark === 'path' || mark === 'goal';
        const kindAt = { base: new Map<number, Mark>(), path: new Map<number, Mark>() };
        for (const { i, mark } of list) (isPath(mark) ? kindAt.path : kindAt.base).set(i, isPath(mark) ? 'path' : mark);
        list.forEach(({ i, mark, dist }, k) => {
            const c = map.cells[i]!;
            this.mesh.setMatrixAt(k, this.m.topMatrix(c, 0.006 + k * 1e-5));
            this.m.cornerOffsets(c).forEach((v, j) => this.attr.corners.setComponent(k, j, v));
            this.attr.diag.setX(k, foldDiagonal(c) === 'b' ? 1 : 0);
            const path = isPath(mark);
            color.setHex(MARK_COLOR[mark]).multiplyScalar(PATH_DIM[mark] ?? 1).toArray(this.attr.color.array as Float32Array, k * 3);
            color.setHex(NODE_COLOR[mark]).multiplyScalar(PATH_DIM[mark] ?? 1).toArray(this.attr.node.array as Float32Array, k * 3);
            const layer = isPath(mark) ? kindAt.path : kindAt.base;
            const same = (dx: number, dz: number): boolean => map.inside(c.x + dx, c.z + dz) && layer.get(map.index(c.x + dx, c.z + dz)) === layer.get(i);
            this.attr.edges.setX(k, (same(1, 0) ? 0 : 1) + (same(-1, 0) ? 0 : 2) + (same(0, -1) ? 0 : 4) + (same(0, 1) ? 0 : 8));
            this.attr.dist.setX(k, dist);
            // 1 — путь, 2 — цель пути (вместо кружка крестик)
            this.attr.pulse.setX(k, mark === 'goal' ? 2 : path ? 1 : 0);
        });
        this.mesh.count = list.length;
        this.mesh.instanceMatrix.needsUpdate = true;
        for (const at of Object.values(this.attr)) at.needsUpdate = true;
        // откуда идёт волна (клетка юнита): по ней фронт мягкий внутри клетки; без неё как раньше, по клеткам
        const oc = origin === null ? null : map.cells[origin]!;
        const at = oc ? this.m.center(oc) : null;
        this.material.uniforms.uHasCenter!.value = at ? 1 : 0;
        if (at) (this.material.uniforms.uCenter!.value as THREE.Vector2).set(at.x, at.z);
        if (key !== this.key) {
            this.key = key;
            this.shownAt = time;
        }
    }

    /** Волна проявления заново (после интро, когда подсветка только открылась). */
    restart(time: number): void {
        this.shownAt = time;
    }

    update(time: number): void {
        this.material.uniforms.uTime!.value = time;
        this.material.uniforms.uShown!.value = time - this.shownAt;
    }
}
