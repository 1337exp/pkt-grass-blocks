// Плашки у цели (STYLE.md, «Плашки»): тёмная скруглённая плашка, слева квадрат с иконкой, справа значение крупно и подпись мелко.
// Синяя по умолчанию, пурпурная у шанса с помехой (акцент траекторий), красная там, где действие невозможно. Одна плашка собирается из
// частей (шанс попадания и очки действия рядом). Это HTML поверх сцены (CSS2D), как подписи юнитов: чёткие при любом повороте камеры.

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { Cell } from '../../core/grid';
import type { Metrics } from './metrics';

/** Наклон камеры в изометрии (около 35°): от него считается, как плашки «над целью» ведут себя в других видах (stage.ts). */
export const PITCH_ISO = 0.62;

/**
 * Плашка стоит над макушкой цели на зазоре `gap`: в изометрии это сдвиг вверх по экрану на gap·cos(наклон) от макушки. В виде сверху
 * высота на экране не видна (плашка легла бы на саму цель), поэтому ту же величину переносим на другие координаты: сдвиг по земле в
 * сторону «вверх экрана» (куда смотрит камера). Берём именно зазор над макушкой, а не всю высоту: сам корпус на экране сверху не
 * поднимается (у вертолёта высота полёта иначе оторвала бы плашку от него). Формула общая для любого наклона: в изометрии сдвига
 * нет, сверху он равен gap·cos(изометрия).
 */
export function plaqueShift(gap: number, yaw: number, pitch: number): THREE.Vector3 {
    const g = (gap * (Math.cos(PITCH_ISO) - Math.cos(pitch))) / Math.sin(pitch);
    return new THREE.Vector3(-Math.sin(yaw) * g, 0, -Math.cos(yaw) * g);
}

export type PlaqueIcon = 'target' | 'bolt' | 'walk' | 'x';
export type PlaqueTone = 'blue' | 'purple' | 'red';

export interface PlaquePart {
    icon: PlaqueIcon;
    /** Значение крупно («81%», «ОД 14»). */
    primary: string;
    /** Окрашенная прибавка рядом со значением («−3»). */
    delta?: string;
    /** Подпись мелко. */
    secondary?: string;
    tone?: PlaqueTone;
}

/** Иконки: простые контуры 24×24 (круги, молния, стрелки), линией, цвет берут у текста. */
const ICONS: Record<PlaqueIcon, string> = {
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    bolt: '<path d="M13 3v7h6l-8 11v-7H5z"/>',
    walk: '<path d="M6 6l6 6-6 6"/><path d="M13 6l6 6-6 6"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
};

function svg(icon: PlaqueIcon): string {
    return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[icon]}</svg>`;
}

const TONE_RANK: Record<PlaqueTone, number> = { blue: 0, purple: 1, red: 2 };

/**
 * Плашка из частей: одна общая рамка, внутри части (иконка, значение, подпись) через тонкую черту; рамка по худшему тону частей.
 * `title` — первой строкой над частями (имя цели: на карте имён нет, они показываются здесь при наведении).
 */
export function plaqueEl(parts: PlaquePart[], title?: string): HTMLElement {
    const root = document.createElement('div');
    const worst = parts.reduce<PlaqueTone>((w, p) => (TONE_RANK[p.tone ?? 'blue'] > TONE_RANK[w] ? (p.tone ?? 'blue') : w), 'blue');
    root.className = `plaque ${worst}`;
    if (title) {
        const head = document.createElement('div');
        head.className = 'plaque-title';
        head.textContent = title;
        root.append(head);
    }
    for (const p of parts) {
        const part = document.createElement('div');
        part.className = `plaque-part ${p.tone ?? 'blue'}`;
        const chip = document.createElement('span');
        chip.className = 'plaque-chip';
        chip.innerHTML = svg(p.icon);
        const text = document.createElement('span');
        text.className = 'plaque-text';
        const main = document.createElement('b');
        main.textContent = p.primary;
        if (p.delta) {
            const d = document.createElement('i');
            d.textContent = ` ${p.delta}`;
            main.append(d);
        }
        text.append(main);
        if (p.secondary) {
            const sub = document.createElement('small');
            sub.textContent = p.secondary;
            text.append(sub);
        }
        part.append(chip, text);
        root.append(part);
    }
    return root;
}

/** Плашка над клеткой пути (цена хода): одна, привязана к точке мира над серединой клетки. */
export class PathPlaque {
    private obj: CSS2DObject | null = null;
    private base = new THREE.Vector3();
    private gap = 0;

    constructor(private readonly root: THREE.Object3D) {}

    /** Показать плашку над клеткой `c` на высоте `lift` (null — убрать). */
    set(m: Metrics, c: Cell | null, lift: number, parts: PlaquePart[], gap = lift): void {
        this.clear();
        if (!c) return;
        this.obj = new CSS2DObject(plaqueEl(parts));
        this.obj.center.set(0.5, 1); // низ плашки на этой точке, по центру клетки
        this.base = m.surface(c, lift);
        this.gap = gap;
        this.obj.position.copy(this.base);
        this.root.add(this.obj);
    }

    /** Вид камеры поменялся: плашка остаётся над целью и в виде сверху (сдвиг по земле вместо высоты). */
    follow(yaw: number, pitch: number): void {
        this.obj?.position.copy(this.base).add(plaqueShift(this.gap, yaw, pitch));
    }

    clear(): void {
        if (!this.obj) return;
        this.obj.element.remove();
        this.obj.removeFromParent();
        this.obj = null;
    }
}
