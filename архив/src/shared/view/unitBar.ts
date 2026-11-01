// Шкала HP юнита: HTML (CSS2DRenderer) под низом модели. Имён на карте нет (они в плашке цели), шкала висит под ногами с пустым зазором: ближе
// к земле меньше всего внимания, взгляд идёт вверх. У вертолёта под брюхом, а не у земли. В виде сверху сдвигается по земле тем же
// приёмом, что плашки цели (plaqueShift), и размер идёт за приближением камеры с потолком.

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { Team } from '../core/entity';
import { PITCH_ISO, plaqueShift } from './board/plaque';
import { ZOOM_MAX } from './board/metrics';
import { UNIT_SCALE } from './unitModel';

/** Зазор под низом модели в мире: от `UNIT_SCALE` не зависит. */
const BAR_GAP = 0.3;
/** Добавка к зазору, только в виде сверху: в изометрии зазор держит высота (она там и так хороша), а сверху он считается по земле и теснее. На изометрию не влияет (сдвиг по земле там нулевой). */
const BAR_GAP_TOP = 0.12;
/** Шкала HP растёт с приближением, но не дальше этого приближения (половина максимального): дальше держит свой размер. */
const BAR_ZOOM_CAP = ZOOM_MAX * 0.5;

/** Что шкале нужно знать о камере: поворот, наклон, приближение (board.viewAngles). */
export interface BarView {
    yaw: number;
    pitch: number;
    zoom: number;
}

export class UnitBar {
    private readonly el = document.createElement('div');
    /** Сама подпись как объект сцены: дочерний у фигуры. */
    readonly tag = new CSS2DObject(this.el);
    /** Высота шкалы в системе фигуры (под низом модели). */
    private base = 0;
    /** Множитель размера по приближению (для `--bar-k` в CSS). */
    private zoomK = 0;

    constructor(team: Team) {
        this.el.className = `unit-label ${team}`;
        this.tag.center.set(0.5, 1); // низ шкалы на отметке под моделью
    }

    private hidden = false;

    /** Прямоугольник шкалы на экране (px страницы). */
    rect(): DOMRect {
        return this.el.getBoundingClientRect();
    }

    /** Спрятать шкалу, не убирая из вёрстки (место остаётся, прямоугольник известен); прозрачность не используем. */
    setHidden(hide: boolean): void {
        if (hide === this.hidden) return;
        this.hidden = hide;
        this.el.style.visibility = hide ? 'hidden' : '';
    }

    /** Нарисовать заполнение по здоровью. */
    render(hp: number, maxHp: number): void {
        const pct = Math.round((hp / maxHp) * 100);
        this.el.innerHTML = `<i><s style="width:${pct}%"></s></i>`;
    }

    /** Поставить под модель, поднятую на `lift` (в единицах фигуры; у вертолёта высота полёта). */
    layout(lift: number): void {
        this.base = lift - BAR_GAP / UNIT_SCALE;
        this.follow({ yaw: 0, pitch: PITCH_ISO, zoom: this.zoomK || 1 }, 0);
    }

    /**
     * Шкала под моделью и в других видах: в изометрии её держит высота (ниже ног), а сверху высоты на экране не видно, и она легла бы
     * на сам корпус. Тот же приём, что у плашек цели, только вниз по экрану: сдвиг по земле на зазор под ногами. `rotationY` фигуры
     * нужен, потому что шкала её дочерняя, а сдвиг считается в мире.
     */
    follow(view: BarView, rotationY: number): void {
        const shift = plaqueShift(-(BAR_GAP + BAR_GAP_TOP), view.yaw, view.pitch); // в мире
        shift.applyAxisAngle(new THREE.Vector3(0, 1, 0), -rotationY).divideScalar(UNIT_SCALE); // в системе фигуры
        this.tag.position.set(shift.x, this.base, shift.z);
        const k = Math.min(view.zoom, BAR_ZOOM_CAP);
        if (k !== this.zoomK) {
            this.zoomK = k;
            this.el.style.setProperty('--bar-k', k.toFixed(3));
        }
    }

    /** Убрать элемент со страницы (сцена его не владеет). */
    dispose(): void {
        this.el.remove();
    }
}
