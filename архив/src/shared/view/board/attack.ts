// Линия атаки: когда выбран герой и курсор на враге в дальности его оружия — плоская лента от героя к врагу (на 70% роста, от
// груди к груди) с бегущими к цели шевронами: откуда и куда бьют, как траектория атаки во FM3 (STYLE.md). Навесное оружие —
// дугой; прямой огонь: помеха на пути (сущность) — красный «✕», выстрел возможен; закрытый местностью обрывается на нём же
// (HTML, page.css: .fire-mark). Линия пурпурная (цвет траекторий), стрелки крупнее неё и цвета радиуса хода (бирюзовые).

import * as THREE from 'three';
import type { Cell } from '../../core/grid';
import type { Look } from './look';
import { TRAJECTORY_COLOR } from '../colors';
import { MARK_COLOR } from './marks';
import { type PlaquePart, plaqueEl, plaqueShift } from './plaque';
import type { Metrics } from './metrics';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { tapeFrag, tapeVert } from './shaders/tape';

/** Половина ширины ленты, в клетках: по ней идут стрелки, сама линия в шейдере уже (`uLine`). */
const HALF = 0.16;
/** Лента не втыкается в роботов: начинается и (если не оборвана преградой) кончается на таком расстоянии от центров клеток, в клетках. */
const INSET = 0.28;
/** Яркость ленты там, где её закрывает земля или фигура (относительно основной 0,8). */
const GHOST_OPACITY = 0.22;

/** Как рисовать линию атаки (см. AttackLine.set). */
export interface AttackOptions {
    arc?: boolean;
    blockT?: number;
    partialT?: number[];
    /** Плашка над целью (шанс попадания, цена в ОД); нет — без плашки. */
    plaque?: PlaquePart[];
    /** Имя цели первой строкой плашки. */
    plaqueTitle?: string;
    /** Высота над клеткой цели, где стоит низ плашки (у юнита это `Unit.markerY`). */
    plaqueLift?: number;
    /** Зазор над макушкой цели (`Unit.overheadGap`): на него плашка сдвигается по земле в виде сверху; нет — как высота. */
    plaqueGap?: number;
}

/** Лента вдоль точек: центральная линия и направление хода в каждой точке, ширину к камере разворачивает шейдер; aAlong — длина в клетках. */
function tapeGeometry(pts: THREE.Vector3[]): THREE.BufferGeometry {
    const pos: number[] = [];
    const across: number[] = [];
    const along: number[] = [];
    const index: number[] = [];
    const dirs: number[] = [];
    const dir = new THREE.Vector3();
    let len = 0;
    pts.forEach((p, k) => {
        const a = pts[Math.max(0, k - 1)]!;
        const b = pts[Math.min(pts.length - 1, k + 1)]!;
        dir.subVectors(b, a).normalize();
        if (k > 0) len += p.distanceTo(pts[k - 1]!);
        pos.push(p.x, p.y, p.z, p.x, p.y, p.z);
        dirs.push(dir.x, dir.y, dir.z, dir.x, dir.y, dir.z);
        across.push(-1, 1);
        along.push(len, len);
        if (k > 0) {
            const v = k * 2;
            index.push(v - 2, v, v - 1, v - 1, v, v + 1);
        }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aAcross', new THREE.Float32BufferAttribute(across, 1));
    g.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 1));
    g.setAttribute('aDir', new THREE.Float32BufferAttribute(dirs, 3));
    g.setIndex(index);
    return g;
}

export class AttackLine {
    private mesh: THREE.Mesh | null = null;
    /** Точки центральной линии ленты в мире (null — линии нет): по ним HUD прячет шкалы HP, которые лента пересекает. */
    path: THREE.Vector3[] | null = null;
    private marks: CSS2DObject[] = [];
    /** Плашка у цели: её точка над целью и высота, чтобы в виде сверху сдвигать по земле. */
    private plaque: { obj: CSS2DObject; base: THREE.Vector3; gap: number } | null = null;
    private readonly material: THREE.ShaderMaterial;
    /** Та же лента там, где её закрывает земля или фигура: бледная, чтобы траектория читалась целиком и не обрывалась на глубине. */
    private readonly ghostMaterial: THREE.ShaderMaterial;

    constructor(
        private readonly root: THREE.Object3D,
        look: Look,
    ) {
        this.material = new THREE.ShaderMaterial({
            vertexShader: tapeVert,
            fragmentShader: tapeFrag,
            uniforms: { uColor: { value: new THREE.Color(TRAJECTORY_COLOR) }, uChev: { value: new THREE.Color(MARK_COLOR.move) }, uOpacity: { value: 0.8 }, uLine: { value: 0.28 }, uHalf: { value: HALF }, uTime: { value: 0 }, uLen: { value: 1 }, ...look.view },
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
        });
        // остальные uniform общие (время, длина, цвета), своя только прозрачность
        this.ghostMaterial = new THREE.ShaderMaterial({
            vertexShader: tapeVert,
            fragmentShader: tapeFrag,
            uniforms: { ...this.material.uniforms, uOpacity: { value: GHOST_OPACITY } },
            transparent: true,
            depthWrite: false,
            depthFunc: THREE.GreaterDepth,
            side: THREE.DoubleSide,
        });
    }

    /**
     * Линия от клетки `from` к клетке `to` на высоте `lift` над ними (одна на оба конца или своя у каждого; null — убрать). `arc` — навесная: дугой над препятствиями.
     * Прямая: `blockT` — где её закрывает преграда (доля пути): линия обрывается там, на месте — красный крестик; `partialT` —
     * помехи (деревья): янтарные крестики поменьше.
     */
    set(m: Metrics, from: Cell | null, to: Cell | null, lift: number | [number, number], opts: AttackOptions = {}): void {
        this.clear();
        if (!from || !to) return;
        // высота концов своя: стрелок или цель в воздухе (вертолёт) выше
        const [liftA, liftB] = typeof lift === 'number' ? [lift, lift] : lift;
        const a = m.surface(from, liftA);
        const b = m.surface(to, liftB);
        const at = (t: number): THREE.Vector3 => {
            const p = a.clone().lerp(b, t);
            // дуга: высота над прямой растёт с дальностью
            if (opts.arc) p.y += 4 * (0.4 + a.distanceTo(b) * 0.12) * t * (1 - t);
            return p;
        };
        const dist = a.distanceTo(b);
        // отступ от роботов с обоих концов (у оборванной преградой ленты конец остаётся у ✕); у вплотную стоящих отступ не больше четверти пути
        const inset = Math.min(INSET / dist, 0.25);
        const start = inset;
        const end = Math.max(start + 0.01, opts.blockT ?? 1 - inset);
        // лента ровная, но точек несколько: шевроны и затухание считаются по длине
        const n = Math.max(2, Math.ceil(dist * (opts.arc ? 8 : 4) * (end - start)));
        const pts = Array.from({ length: n + 1 }, (_, k) => at(start + (k / n) * (end - start)));
        this.path = pts;
        let len = 0;
        for (let k = 1; k < pts.length; k++) len += pts[k]!.distanceTo(pts[k - 1]!);
        this.mesh = new THREE.Mesh(tapeGeometry(pts), this.material);
        this.material.uniforms.uLen!.value = len;
        // поверх курсора: его тёмная обводка иначе перекрывает ленту
        this.mesh.renderOrder = 3;
        this.mesh.frustumCulled = false;
        this.mesh.raycast = () => {};
        const ghost = new THREE.Mesh(this.mesh.geometry, this.ghostMaterial);
        ghost.renderOrder = 3;
        ghost.frustumCulled = false;
        ghost.raycast = () => {};
        this.mesh.add(ghost);
        this.root.add(this.mesh);

        // отметки — HTML поверх сцены (как подписи юнитов): всегда лицом к экрану и чёткие при любом повороте камеры
        if (opts.blockT !== undefined) this.addMark(at(opts.blockT));
        for (const t of opts.partialT ?? []) this.addMark(at(t));
        if (opts.plaque?.length) this.addPlaque(m.surface(to, opts.plaqueLift ?? liftB), opts.plaqueGap ?? opts.plaqueLift ?? liftB, opts.plaque, opts.plaqueTitle);
    }

    /** Плашка у цели, как во FM3 (проценты и цена рядом с врагом). */
    private addPlaque(p: THREE.Vector3, gap: number, parts: PlaquePart[], title?: string): void {
        const mark = new CSS2DObject(plaqueEl(parts, title));
        mark.center.set(0.5, 1); // низ плашки на этой точке, по центру цели
        mark.position.copy(p);
        this.root.add(mark);
        this.marks.push(mark);
        this.plaque = { obj: mark, base: p.clone(), gap };
    }

    /** Вид камеры поменялся: плашка остаётся над целью и в виде сверху (сдвиг по земле вместо высоты). */
    follow(yaw: number, pitch: number): void {
        if (this.plaque) this.plaque.obj.position.copy(this.plaque.base).add(plaqueShift(this.plaque.gap, yaw, pitch));
    }

    private addMark(p: THREE.Vector3): void {
        const el = document.createElement('div');
        el.className = 'fire-mark';
        el.textContent = '✕';
        const mark = new CSS2DObject(el);
        mark.position.copy(p);
        this.root.add(mark);
        this.marks.push(mark);
    }

    update(time: number): void {
        this.material.uniforms.uTime!.value = time;
    }

    clear(): void {
        this.plaque = null;
        for (const mk of this.marks) {
            mk.element.remove();
            mk.removeFromParent();
        }
        this.marks = [];
        this.path = null;
        if (!this.mesh) return;
        this.mesh.geometry.dispose();
        this.mesh.removeFromParent();
        this.mesh = null;
    }

    dispose(): void {
        this.clear();
        this.material.dispose();
        this.ghostMaterial.dispose();
    }
}
