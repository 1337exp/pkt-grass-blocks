// Камера как состояние и математика, без DOM и рендера: цель, поворот, наклон, масштаб, плавное догоняние, интро уровня, сдвиг по земле, место
// камеры на сцене. Stage (stage.ts) создаёт рендер и ввод, а этот класс только отвечает «куда сейчас смотрит камера».

import * as THREE from 'three';
import { ZOOM_MAX, ZOOM_MIN } from './board/metrics';
import { PITCH_ISO } from './board/plaque';

/** Полвысоты кадра в единицах мира при масштабе 1. */
export const VIEW_HALF = 8.5;
/** Наклон камеры: изометрия (около 35°, `PITCH_ISO`) и вид сверху (почти отвесно: ровно 90° ломает lookAt). */
export const PITCH_TOP = Math.PI / 2 - 0.001;
/** Шаг поворота камеры клавишами Q / E, и в изометрии, и сверху. */
export const ROTATE_STEP = Math.PI / 4;
/** С какой доли обычного приближения начинается интро. */
const INTRO_ZOOM_FROM = 0.7;
/** Расстояние камеры от цели (ортографическая камера: на размер не влияет, нужно лишь чтобы сцена была перед ней). */
const DISTANCE = 40;

/** Интро уровня: сколько прошло и сколько идёт, приближение до интро (к нему камера вернётся). */
interface Intro {
    t: number;
    dur: number;
    zoom: number;
}

export class CameraRig {
    readonly target = new THREE.Vector3(0, 0.8, 0);
    readonly targetWant = new THREE.Vector3(0, 0.8, 0);
    yaw = Math.PI / 4;
    yawWant = Math.PI / 4;
    pitch = PITCH_ISO;
    pitchWant = PITCH_ISO;
    zoom = 1;
    private intro: Intro | null = null;

    get topView(): boolean {
        return this.pitchWant === PITCH_TOP;
    }

    get introActive(): boolean {
        return this.intro !== null;
    }

    /**
     * Вид сверху или изометрия: камера плавно поднимается в зенит и обратно. Сверху сетка стоит ровно по экрану (поворот кратен 90°),
     * в изометрии по диагонали (кратен 90° плюс 45°): при переключении поворот доворачивается на 45°.
     */
    setTopView(on: boolean): void {
        if (on === this.topView) return;
        this.pitchWant = on ? PITCH_TOP : PITCH_ISO;
        this.yawWant += on ? -ROTATE_STEP : ROTATE_STEP;
    }

    /** Повернуть на `steps` шагов по 45° (минус — против часовой). */
    rotate(steps: number): void {
        this.yawWant += steps * ROTATE_STEP;
    }

    /** Масштаб колесом мыши (`deltaY` как у события wheel), в пределах `ZOOM_MIN`…`ZOOM_MAX`. */
    zoomBy(deltaY: number): void {
        this.zoom = THREE.MathUtils.clamp(this.zoom * Math.exp(-deltaY * 0.0012), ZOOM_MIN, ZOOM_MAX);
    }

    /** Камера плавно наезжает на точку мира (как в FM3 при выборе юнита). */
    focus(p: THREE.Vector3): void {
        this.targetWant.set(p.x, this.targetWant.y, p.z);
    }

    /**
     * Сдвиг цели на (dx, dy) пикселей экрана: по земле, с учётом поворота и наклона. `viewPx` — высота кадра в пикселях, `limit` — насколько
     * далеко от центра карты можно уехать.
     */
    pan(dxPx: number, dyPx: number, viewPx: number, limit: number): void {
        const perPx = (2 * VIEW_HALF) / this.zoom / viewPx;
        const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
        const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
        // вертикаль экрана ложится на землю под наклоном: по ней пиксель стоит дальше
        this.targetWant.addScaledVector(right, -dxPx * perPx).addScaledVector(fwd, (dyPx * perPx) / Math.sin(this.pitch));
        this.targetWant.x = THREE.MathUtils.clamp(this.targetWant.x, -limit, limit);
        this.targetWant.z = THREE.MathUtils.clamp(this.targetWant.z, -limit, limit);
        this.target.copy(this.targetWant); // ручной сдвиг без задержки
    }

    /** Интро: полный оборот и наезд на поле (быстро в начале, мягко в конце) за `seconds`. */
    playIntro(seconds: number): void {
        this.intro = { t: 0, dur: seconds, zoom: this.zoom };
    }

    /** Закончить интро сразу: камера на обычном месте. Возвращает, шло ли оно. */
    skipIntro(): boolean {
        if (!this.intro) return false;
        this.yaw = this.yawWant;
        this.zoom = this.intro.zoom;
        this.intro = null;
        return true;
    }

    /**
     * Кадр: поворот, наклон и цель плавно догоняют желаемое (`dt` — время для движения), интро идёт по настоящему времени `real`. Возвращает
     * долю пройденного интро (0…1) пока оно идёт, иначе null; на последнем кадре интро это 1.
     */
    update(dt: number, real: number): number | null {
        let introK: number | null = null;
        const intro = this.intro;
        if (intro) {
            intro.t += real; // настоящее время, а не dt: на слабом кадре интро не должно растягиваться
            introK = Math.min(1, intro.t / intro.dur);
            const ease = 1 - (1 - introK) ** 3;
            this.yaw = this.yawWant + Math.PI * 2 * (1 - ease);
            this.zoom = intro.zoom * (INTRO_ZOOM_FROM + (1 - INTRO_ZOOM_FROM) * ease);
            if (introK >= 1) this.intro = null;
        } else {
            this.yaw += (this.yawWant - this.yaw) * (1 - Math.exp(-dt / 0.08));
        }
        this.pitch += (this.pitchWant - this.pitch) * (1 - Math.exp(-dt / 0.1));
        this.target.lerp(this.targetWant, 1 - Math.exp(-dt / 0.15));
        return introK;
    }

    /** Поставить камеру сцены по текущему состоянию. */
    place(camera: THREE.OrthographicCamera): void {
        const c = Math.cos(this.pitch);
        camera.position.set(this.target.x + Math.sin(this.yaw) * c * DISTANCE, this.target.y + Math.sin(this.pitch) * DISTANCE, this.target.z + Math.cos(this.yaw) * c * DISTANCE);
        // сверху «верх» экрана задаёт поворот, а не мировая вертикаль (иначе lookAt не знает, куда смотреть)
        camera.up.set(-Math.sin(this.yaw), Math.cos(this.pitch) > 0.05 ? 1 : 0, -Math.cos(this.yaw)).normalize();
        camera.lookAt(this.target);
        camera.zoom = this.zoom;
        camera.updateProjectionMatrix();
    }
}
