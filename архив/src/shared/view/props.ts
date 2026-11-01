// Объекты на карте (ENTITIES.md): дерево и контейнер — простые фигуры в тёмной гамме поля, рёбра обведены тонкими линиями,
// чтобы форма читалась на почти чёрном. Стоят в центре своей клетки (на склоне — на средней высоте, как юниты). Без подписей:
// это не бойцы, имя и здоровье появятся с боем.

import * as THREE from 'three';
import type { Cell } from '../core/grid';
import type { Entity } from '../core/entity';
import type { Board } from './board';
import { fadeToGround } from './groundFade';

/** Тень вида: полуоси пятна в долях клетки по x и z (контейнер вытянут вдоль x, как сам короб). */
/** Контейнер уменьшен на 10% против первой модели (0,86 × 0,5 × 0,46): тень и основание ниже следуют за ним. */
const K = 0.9;
export const PROP_SHADOW: Record<string, [number, number]> = { tree: [0.5, 0.5], container: [0.56 * K, 0.38 * K] };
/** Основание вида (контактная тень): у дерева — ствол, у контейнера — короб 0,77 × 0,41. */
export const PROP_CONTACT: Record<string, { size: [number, number]; box?: boolean }> = {
    tree: { size: [0.09, 0.09] },
    container: { size: [0.44 * K, 0.24 * K], box: true },
};

/** Тёмные тела, чуть разные по оттенку: металл контейнера холоднее, крона зеленее, ствол теплее. */
const STEEL = 0x222c38;
const LEAVES = 0x1c2c25;
const TRUNK = 0x2a2420;
/** Рёбра: серые, как края уступов, — тот же язык тонких линий; видимость низкая (0,15): форма читается, сцена не паутина. */
const EDGE = 0x7d8794;
const EDGE_OPACITY = 0.15;

/** Фигура вида: тело и (почти у всех) обводка рёбер. */
function build(type: string, group: THREE.Group): void {
    const height = type === 'container' ? 0.5 * K : 1;
    const solid = (geo: THREE.BufferGeometry, color: number, y: number, edges = true): THREE.Mesh => {
        fadeToGround(geo, y, height);
        const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, flatShading: true, vertexColors: true }));
        mesh.position.y = y;
        if (edges) mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), new THREE.LineBasicMaterial({ color: EDGE, transparent: true, opacity: EDGE_OPACITY })));
        group.add(mesh);
        return mesh;
    };
    if (type === 'container') {
        // морской контейнер: вытянутый короб поперёк клетки, с рёбрами жёсткости по длинной стороне
        solid(new THREE.BoxGeometry(0.86 * K, 0.5 * K, 0.46 * K), STEEL, 0.25 * K);
        for (const x of [-0.24, 0, 0.24]) solid(new THREE.BoxGeometry(0.02 * K, 0.44 * K, 0.47 * K), STEEL, 0.25 * K).position.x = x * K;
    } else if (type === 'tree') {
        // ствол и крона из двух гранёных ярусов
        solid(new THREE.CylinderGeometry(0.05, 0.07, 0.34, 6), TRUNK, 0.17, false);
        solid(new THREE.ConeGeometry(0.34, 0.5, 7), LEAVES, 0.52);
        solid(new THREE.ConeGeometry(0.25, 0.4, 7), LEAVES, 0.8).rotation.y = 0.4;
    } else {
        // неизвестный вид: заметный куб, чтобы не потерялся на карте
        solid(new THREE.BoxGeometry(0.5, 0.5, 0.5), 0x553333, 0.25);
    }
}

export class Prop {
    readonly obj = new THREE.Group();

    constructor(
        readonly entity: Entity,
        private readonly board: Board,
    ) {
        build(entity.type, this.obj);
        // каждый объект чуть повёрнут по-своему (по клетке, стабильно): ряд деревьев не выглядит штампом
        if (entity.type === 'tree') this.obj.rotation.y = ((entity.pos.x * 7 + entity.pos.z * 13) % 10) * 0.6;
        this.place();
    }

    cell(): Cell {
        return this.board.map.at(this.entity.pos.x, this.entity.pos.z)!;
    }

    /** Встать в центр своей клетки (после правки рельефа или переноса). */
    place(): void {
        this.obj.position.copy(this.board.surface(this.cell()));
    }

    dispose(): void {
        this.obj.removeFromParent();
        this.obj.traverse((o) => {
            const m = o as THREE.Mesh;
            m.geometry?.dispose();
            (m.material as THREE.Material | undefined)?.dispose();
        });
    }
}
