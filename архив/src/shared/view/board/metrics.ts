// Где клетка лежит в мире: центр на плоскости, нижний уровень верха (с провалом воды), высоты углов склона, точка над серединой.
// Это спрашивают все слои поля, выбор мышью и юниты. Клетка 1×1, карта по центру начала координат.

import * as THREE from 'three';
import { type Cell, cornerLevel, foldDiagonal, type GridMap, type Terrain } from '../../core/grid';

/**
 * Высота одного уровня и подставка под нулевым уровнем, в единицах мира. Уровень примерно равен меху (рост меха 0,44): во FM3 в 3D
 * платформа на уровень парит на высоту меха. Половинный уровень (0,2) пробовали, когда по 2D-виду казалось, что уровень вдвое
 * ниже, и откатили.
 */
export const LEVEL_H = 0.4;

/** Пределы приближения камеры (колесо мыши): от них и от них же считается потолок размера шкалы HP. */
export const ZOOM_MIN = 0.6;
export const ZOOM_MAX = 2.6;
const BASE_H = 0.3;
/** Вода ниже края берега: мелкая чуть, глубокая заметно ниже мелкой (граница «мелко / глубоко» читается на глаз). */
const WATER_DIP: Partial<Record<Terrain, number>> = { shallow: 0.06, deep: 0.16 };

/** Четыре стороны клетки: (dx, dz). */
export const SIDES = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
] as const;

export class Metrics {
    constructor(readonly map: GridMap) {}

    /** Нижний уровень верха клетки в мире (у склона от него поднимаются углы). */
    topY(c: Cell): number {
        return BASE_H + c.h * LEVEL_H - (WATER_DIP[c.terrain] ?? 0);
    }

    /** Центр клетки на плоскости мира. */
    center(c: { x: number; z: number }): { x: number; z: number } {
        return { x: c.x - this.map.w / 2 + 0.5, z: c.z - this.map.d / 2 + 0.5 };
    }

    /** Подъёмы углов клетки над её нижним уровнем, в единицах мира: (x−,z−), (x+,z−), (x+,z+), (x−,z+). */
    cornerOffsets(c: Cell): [number, number, number, number] {
        const k = c.corners;
        return k ? [k[0] * LEVEL_H, k[1] * LEVEL_H, k[2] * LEVEL_H, k[3] * LEVEL_H] : [0, 0, 0, 0];
    }

    /** Угол клетки в мире (ix, iz: 0 у меньшей координаты, 1 у большей). */
    cornerPoint(c: Cell, ix: number, iz: number): THREE.Vector3 {
        const { x, z } = this.center(c);
        return new THREE.Vector3(x - 0.5 + ix, this.topY(c) + (cornerLevel(c, ix, iz) - c.h) * LEVEL_H, z - 0.5 + iz);
    }

    /** Точка в мире над серединой верха клетки. У склона середина лежит на диагонали сгиба: среднее её двух углов. */
    surface(c: Cell, lift = 0): THREE.Vector3 {
        const { x, z } = this.center(c);
        const k = this.cornerOffsets(c);
        const mid = foldDiagonal(c) === 'b' ? (k[1] + k[3]) / 2 : (k[0] + k[2]) / 2;
        return new THREE.Vector3(x, this.topY(c) + mid + lift, z);
    }

    /** Высота верха клетки в её углу, ближайшем к точке (px, pz): края уступов и вертикали спрашивают как раз углы. */
    heightAt(c: Cell, px: number, pz: number): number {
        const { x, z } = this.center(c);
        return this.cornerPoint(c, px > x ? 1 : 0, pz > z ? 1 : 0).y;
    }

    /** Сдвиг квадрата клетки (cellQuadGlsl) на её нижний уровень, на `lift` выше; наклон углов добавляет шейдер. */
    topMatrix(c: Cell, lift = 0): THREE.Matrix4 {
        const { x, z } = this.center(c);
        return new THREE.Matrix4().makeTranslation(x, this.topY(c) + lift, z);
    }

    /** Концы стороны клетки, обращённой в (dx, dz), в мировых координатах. */
    sideEnds(c: Cell, dx: number, dz: number): [{ x: number; z: number }, { x: number; z: number }] {
        const { x, z } = this.center(c);
        const ex = x + dx * 0.5;
        const ez = z + dz * 0.5;
        return [
            { x: ex - Math.abs(dz) * 0.5, z: ez - Math.abs(dx) * 0.5 },
            { x: ex + Math.abs(dz) * 0.5, z: ez + Math.abs(dx) * 0.5 },
        ];
    }
}
