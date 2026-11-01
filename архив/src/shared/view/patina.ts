// Патина серебра: мелкая пятнистая текстура для отходившего юнита («серебряная статуя»). Светлая основа с мягкими зеленовато-стальными
// и тёмными пятнами: корпус перестаёт быть ровной краской и читается старым металлом. Умножается на цвет материала.

import * as THREE from 'three';

const SIZE = 64;
let cached: THREE.CanvasTexture | null = null;

/** Простой повторяемый случайный: текстура одна и та же при каждом запуске. */
function rng(seed: number): () => number {
    let s = seed;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

/** Текстура патины (общая для всех фигур), с повтором по краям. */
export function patinaTexture(): THREE.CanvasTexture {
    if (cached) return cached;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#e4e9ee';
    ctx.fillRect(0, 0, SIZE, SIZE);
    const rand = rng(7);
    // пятна: зеленовато-стальные (налёт) и тёмные (потёртость); рисуем со смещением на ±SIZE, чтобы текстура стыковалась по краям
    const blot = (color: string, alpha: number, count: number, rMin: number, rMax: number): void => {
        for (let i = 0; i < count; i++) {
            const x = rand() * SIZE;
            const y = rand() * SIZE;
            const r = rMin + rand() * (rMax - rMin);
            for (const ox of [-SIZE, 0, SIZE]) {
                for (const oy of [-SIZE, 0, SIZE]) {
                    const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
                    g.addColorStop(0, color.replace('A', String(alpha)));
                    g.addColorStop(1, color.replace('A', '0'));
                    ctx.fillStyle = g;
                    ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
                }
            }
        }
    };
    blot('rgba(120, 168, 160, A)', 0.55, 14, 6, 14); // налёт: холодная зелень
    blot('rgba(70, 82, 96, A)', 0.4, 10, 3, 9); // потёртости и тёмные потёки
    blot('rgba(255, 255, 255, A)', 0.5, 8, 2, 6); // блики
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    cached = tex;
    return tex;
}
