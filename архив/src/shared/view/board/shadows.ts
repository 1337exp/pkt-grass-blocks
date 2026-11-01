// Тени под сущностями (мехи, деревья, контейнеры): грубое мягкое пятно на верхе клетки, как во FM3, — показывает занятость
// клетки и «сажает» фигуру на землю; поверх него контактная тень — узкая почти чёрная, ровно по основанию фигуры (без неё
// фигура на тёмной земле может казаться парящей: мягкая тень говорит «тут что-то стоит», контактная — «стоит именно здесь»). Рисуется слоем поля (квадрат клетки со склонами, cellQuadGlsl), поэтому на пандусе тень
// ложится по наклону. Положение берётся у фигуры каждый кадр: тень едет вместе с идущим мехом.

import * as THREE from 'three';
import { foldDiagonal } from '../../core/grid';
import { cellQuadGeometry } from './geometry';
import type { Metrics } from './metrics';
import { cellQuadGlsl } from './shaders/common';

/** Фигура на поле: где она в мире (obj), размер её тени — полуоси пятна в долях клетки по x и z — и основания (контактная тень). */
export interface ShadowCaster {
    obj: THREE.Object3D;
    shadow: [number, number];
    /** Полуоси основания по x и z; `box` — короб (прямоугольник со скруглёнными углами), иначе круг или эллипс. */
    contact: { size: [number, number]; box?: boolean };
}

/** Сколько фигур поле держит в слое теней (больше — лишние без тени). */
const MAX = 256;
/**
 * Тень проявляется, пока фигура опускается на землю: выше `SHADOW_FADE_FROM` над клеткой её нет, у земли полная. Прыжок шага (до полуклетки
 * над землёй) тень не трогает; плавно она появляется, когда сущность падает сверху (интро уровня, board/intro.ts).
 */
const SHADOW_FADE_FROM = 0.6;
const SHADOW_FADE_TO = 3.5;
/** Свет сверху-слева: тень чуть сдвинута в сторону +x, +z (в долях клетки). */
const OFFSET: [number, number] = [0.08, 0.08];

const vert = /* glsl */ `
attribute float aDiag;
attribute vec4 aShadow;
attribute vec3 aContact;
attribute float aAppear;
varying vec2 vUv;
varying vec4 vShadow;
varying vec3 vContact;
varying float vAppear;
${cellQuadGlsl}
void main() {
    vUv = cellUv(aDiag);
    vShadow = aShadow;
    vContact = aContact;
    vAppear = aAppear;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(cellLocal(vUv), 1.0);
}`;

const frag = /* glsl */ `
uniform vec2 uOffset;
varying vec2 vUv;
varying vec4 vShadow;
varying vec3 vContact;
varying float vAppear;
void main() {
    // пятно: центр (vShadow.xy в uv клетки), полуоси vShadow.zw; край мягкий. Плотное: на почти чёрной земле лёгкая тень не
    // видна — тень читается тем, что под фигурой гаснут сетка и зерно
    vec2 p = (vUv - vShadow.xy) / vShadow.zw;
    // плотность мягкой тени 0,74 (было 0,82): на 10% прозрачнее у всех, чтобы не топить фигуры
    float a = (1.0 - smoothstep(0.35, 1.0, length(p))) * 0.74;
    // контактная: по основанию, без сдвига от света, почти чёрная, край короткий; у короба — «скруглённый квадрат»
    // (степень 4 вместо круга)
    vec2 c = abs(vUv - (vShadow.xy - uOffset)) / vContact.xy;
    float d = vContact.z > 0.5 ? pow(pow(c.x, 4.0) + pow(c.y, 4.0), 0.25) : length(c);
    a = max(a, (1.0 - smoothstep(0.85, 1.12, d)) * 0.95);
    a *= vAppear;
    if (a <= 0.003) discard;
    gl_FragColor = vec4(0.0, 0.0, 0.0, a);
}`;

export class ShadowLayer {
    readonly mesh: THREE.InstancedMesh;
    private readonly corners: THREE.InstancedBufferAttribute;
    private readonly diag: THREE.InstancedBufferAttribute;
    private readonly shadow: THREE.InstancedBufferAttribute;
    private readonly contact: THREE.InstancedBufferAttribute;
    private readonly appear: THREE.InstancedBufferAttribute;

    constructor() {
        const g = cellQuadGeometry();
        this.corners = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
        this.diag = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1).setUsage(THREE.DynamicDrawUsage);
        this.shadow = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
        this.contact = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3).setUsage(THREE.DynamicDrawUsage);
        g.setAttribute('aCorners', this.corners);
        g.setAttribute('aDiag', this.diag);
        g.setAttribute('aShadow', this.shadow);
        this.appear = new THREE.InstancedBufferAttribute(new Float32Array(MAX).fill(1), 1).setUsage(THREE.DynamicDrawUsage);
        g.setAttribute('aContact', this.contact);
        g.setAttribute('aAppear', this.appear);
        const material = new THREE.ShaderMaterial({
            vertexShader: vert,
            fragmentShader: frag,
            // сдвиг мягкой тени в uv клетки: контактная стоит без него, ровно под фигурой
            uniforms: { uOffset: { value: new THREE.Vector2(OFFSET[0], -OFFSET[1]) } },
            transparent: true,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -1,
        });
        this.mesh = new THREE.InstancedMesh(g, material, MAX);
        this.mesh.count = 0;
        // под подсветкой хода: рама радиуса ложится поверх тени
        this.mesh.renderOrder = 0.5;
        this.mesh.frustumCulled = false;
        this.mesh.raycast = () => {};
    }

    /** Тени под фигурами там, где они сейчас (в мире): клетка под фигурой и сдвиг пятна внутри неё. */
    update(m: Metrics, casters: ShadowCaster[]): void {
        const { map } = m;
        let k = 0;
        for (const { obj, shadow, contact } of casters) {
            if (k >= MAX) break;
            // клетка под фигурой: центр клетки (x, z) лежит в мире на (x − w/2 + 0,5, z − d/2 + 0,5)
            const fx = obj.position.x + map.w / 2 - 0.5;
            const fz = obj.position.z + map.d / 2 - 0.5;
            const c = map.at(Math.round(fx), Math.round(fz));
            if (!c) continue;
            this.mesh.setMatrixAt(k, m.topMatrix(c, 0.003));
            m.cornerOffsets(c).forEach((v, j) => this.corners.setComponent(k, j, v));
            this.diag.setX(k, foldDiagonal(c) === 'b' ? 1 : 0);
            // uv клетки: x вдоль мира +x, y вдоль мира −z
            this.shadow.setXYZW(k, 0.5 + (fx - c.x) + OFFSET[0], 0.5 - (fz - c.z) - OFFSET[1], shadow[0], shadow[1]);
            // основание повёрнуто вместе с фигурой: у короба поворот кратен 90°, полуоси меняются местами
            const turned = Math.abs(Math.sin(obj.rotation.y)) > 0.7;
            // высота фигуры над своей клеткой: падающая сверху сначала без тени
            const h = obj.position.y - m.surface(c).y;
            const u = Math.min(1, Math.max(0, (h - SHADOW_FADE_FROM) / (SHADOW_FADE_TO - SHADOW_FADE_FROM)));
            this.appear.setX(k, 1 - u * u * (3 - 2 * u));
            this.contact.setXYZ(k, turned ? contact.size[1] : contact.size[0], turned ? contact.size[0] : contact.size[1], contact.box ? 1 : 0);
            k++;
        }
        this.mesh.count = k;
        this.mesh.instanceMatrix.needsUpdate = true;
        this.corners.needsUpdate = true;
        this.diag.needsUpdate = true;
        this.shadow.needsUpdate = true;
        this.contact.needsUpdate = true;
        this.appear.needsUpdate = true;
    }

    dispose(): void {
        this.mesh.geometry.dispose();
        (this.mesh.material as THREE.Material).dispose();
    }
}
