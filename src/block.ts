// Один блок травы: каменное тело и поверх него тонкая оболочка травы.
// Оболочка шире камня, поэтому шапка нависает, а силуэт выходит за границу камня, как на референсе.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { grass, stone, vertex } from './shaders';
import { controls } from './controls';
import { createTufts } from './tufts';

const HEIGHT = 1.3;
const SHELL_PAD = 0.1;
const SHELL_LIFT = 0.05;

const color = (hex: number): THREE.Color => new THREE.Color(hex);

const loader = new THREE.TextureLoader();

/** Нарисованная плитка из public/tex: повторяется, цвет читается как sRGB. */
const tiles = new Map<string, THREE.Texture>();

function tile(name: string): THREE.Texture {
    const cached = tiles.get(name);
    if (cached) return cached;
    const tex = loader.load(`/tex/${name}.png`);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tiles.set(name, tex);
    return tex;
}

/** Блок 1×1 с центром в (x, z). Узоры считаются по мировым координатам, поэтому соседние блоки продолжают друг друга. */
export function createBlock(x = 0, z = 0): THREE.Group {
    const top = HEIGHT + SHELL_LIFT;
    const origin = { value: new THREE.Vector2(x, z) };
    // Множитель цвета травы блока: оттенок блока меняется через group.userData.tint.
    const tint = { value: new THREE.Vector3(1, 1, 1) };
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    // Шейдеры читают высоту из координат вершин, поэтому сдвиг запекаем в геометрию, а не в позицию меша.
    const bodyGeo = new RoundedBoxGeometry(1, HEIGHT, 1, 3, 0.04);
    bodyGeo.translate(0, HEIGHT / 2, 0);
    const body = new THREE.Mesh(
        bodyGeo,
        new THREE.ShaderMaterial({
            vertexShader: vertex,
            fragmentShader: stone,
            uniforms: {
                uOrigin: origin,
                uTop: { value: top },
                uStoneMap: { value: tile('stone-wall') },
                uStoneScale: controls.stoneScale,
                uDrip: controls.drip,
                uRoot: { value: color(0x2b2418) },
            },
        }),
    );

    const shellHeight = HEIGHT + SHELL_LIFT * 2;
    const shellGeo = new RoundedBoxGeometry(1 + SHELL_PAD, shellHeight, 1 + SHELL_PAD, 6, 0.13);
    shellGeo.translate(0, shellHeight / 2 - SHELL_LIFT, 0);
    const shell = new THREE.Mesh(
        shellGeo,
        new THREE.ShaderMaterial({
            vertexShader: vertex,
            fragmentShader: grass,
            uniforms: {
                uOrigin: origin,
                uTop: { value: top },
                uTopMap: { value: tile('grass-top') },
                uSideMap: { value: tile('grass-side') },
                uDrip: controls.drip,
                uTint: tint,
                uDeep: { value: color(0x4f8f1c) },
                uRim: { value: color(0x2f5a14) },
            },
        }),
    );

    group.userData.tint = tint.value;
    group.add(body, shell, createTufts(top, tint, Math.round(x * 3 + z * 7)));
    return group;
}
