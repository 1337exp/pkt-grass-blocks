// Пирамидка выбранного юнита: остриём вниз над макушкой, плавно качается и медленно вращается, вокруг мягкий ореол и тёмные швы по рёбрам.
// Стоит над макушкой модели, а не на фиксированной высоте: другой масштаб её не прижмёт к голове. Размер задан в мире, от масштаба меха не
// зависит.

import * as THREE from 'three';
import { SELECT_GREEN } from './colors';
import { UNIT_SCALE } from './unitModel';

/** Зазор между макушкой и пирамидкой в мире. */
const MARKER_GAP = 0.15;
/** Пирамидка прежнего размера в мире (её размер от масштаба меха не уменьшается): конус 0,08 × 0,16 при масштабе 1,2. */
const MARKER_WORLD_SCALE = 1.2;
const MARKER_BOB = 0.05;
/**
 * Яркость пирамидки относительно зелёного выбора: светит постоянно (у курсора рамка тусклая, ярки лишь огоньки), поэтому тише.
 * Держим ниже порога блума (сцена: порог 0,4, фильтр почти ступенька: на 0,67 блума нет, на 0,68 уже «прожектор»), а свечение даёт
 * мягкий ореол `MARKER_HALO`, которым управляем плавно.
 */
const MARKER_DIM = 0.62;
/** Ореол пирамидки: непрозрачность (аддитивно) и размер относительно самой пирамидки. */
const MARKER_HALO = 0.05;
const MARKER_HALO_SCALE = 1.4;

/**
 * Зазор между макушкой модели и центром пирамидки (зазор и половина пирамидки): постоянный. Плашки в виде сверху сдвигаются по земле на
 * него, а не на всю высоту отметки: тело на экране не поднимается, и плашка у вертолёта оторвалась бы от него на его высоту полёта.
 */
export const OVERHEAD_GAP = MARKER_GAP + (0.16 * MARKER_WORLD_SCALE) / 2;

export class SelectMarker {
    readonly mesh: THREE.Mesh;
    private time = 0;
    /** Высота над клеткой в мире, где парит центр пирамидки. Плашки у цели стоят низом на этой же отметке. */
    worldY = 0;

    /**
     * `color` — зелёный выбора (по умолчанию) или оранжевый у врагов в радиусе атаки. `spin` — вращается ли: вращение только у зелёной выбора,
     * у оранжевых просто плавают (разгрузка сцены от эффектов).
     */
    constructor(color: number = SELECT_GREEN, private readonly spin = true) {
        this.mesh = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.16, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(MARKER_DIM), transparent: true, opacity: 0.8 }));
        this.mesh.scale.setScalar(MARKER_WORLD_SCALE / UNIT_SCALE);
        // ореол: увеличенная копия с обратными гранями, аддитивная и без записи глубины, виден только вокруг пирамидки
        const halo = new THREE.Mesh(
            this.mesh.geometry,
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: MARKER_HALO, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide }),
        );
        halo.scale.setScalar(MARKER_HALO_SCALE);
        this.mesh.add(halo);
        this.mesh.rotation.x = Math.PI; // остриём вниз
        // рёбра — около-чёрные линии, как шов подсветки: грани не сливаются друг с другом и с фоном
        const seams = new THREE.LineSegments(new THREE.EdgesGeometry(this.mesh.geometry), new THREE.LineBasicMaterial({ color: 0x05080d, transparent: true, opacity: 0.9 }));
        seams.scale.setScalar(1.01);
        this.mesh.add(seams);
        this.mesh.visible = false;
    }

    /** Показать или спрятать; качание начинается заново только при смене видимости. */
    setVisible(on: boolean): void {
        if (on === this.mesh.visible) return; // повторный вызов (курсор бегает по клеткам, подсветка обновляется) анимацию не сбрасывает
        this.mesh.visible = on;
        this.time = 0;
    }

    /** Поставить над макушкой на мировой высоте `top` (над клеткой). */
    layout(top: number): void {
        this.worldY = top + OVERHEAD_GAP;
        this.mesh.position.y = this.worldY / UNIT_SCALE;
    }

    /** Кадр: качание и вращение, пока видна. */
    update(dt: number): void {
        if (!this.mesh.visible) return;
        this.time += dt;
        this.mesh.position.y = (this.worldY + Math.sin(this.time * 2.4) * MARKER_BOB) / UNIT_SCALE;
        if (this.spin) this.mesh.rotation.y = this.time * 0.9;
    }
}
