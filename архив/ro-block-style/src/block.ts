// Один блок травы: каменное тело и поверх него тонкая оболочка травы.
// Оболочка шире камня, поэтому шапка нависает, а силуэт выходит за границу камня, как на референсе.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { grass, stone, vertex } from './shaders';

const HEIGHT = 1.3;
const SHELL_PAD = 0.1;
const SHELL_LIFT = 0.05;

const color = (hex: number): THREE.Color => new THREE.Color(hex);

const loader = new THREE.TextureLoader();

/** Нарисованная плитка из public/tex: повторяется, цвет читается как sRGB. */
function tile(name: string): THREE.Texture {
    const tex = loader.load(`/tex/${name}.png`);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
}

export function createBlock(): THREE.Group {
    const top = HEIGHT + SHELL_LIFT;
    const group = new THREE.Group();

    // Шейдеры читают высоту из координат вершин, поэтому сдвиг запекаем в геометрию, а не в позицию меша.
    const bodyGeo = new RoundedBoxGeometry(1, HEIGHT, 1, 3, 0.04);
    bodyGeo.translate(0, HEIGHT / 2, 0);
    const body = new THREE.Mesh(
        bodyGeo,
        new THREE.ShaderMaterial({
            vertexShader: vertex,
            fragmentShader: stone,
            uniforms: {
                uTop: { value: top },
                uStoneMap: { value: tile('stone-wall') },
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
                uTop: { value: top },
                uTopMap: { value: tile('grass-top') },
                uSideMap: { value: tile('grass-side') },
                uDeep: { value: color(0x4f8f1c) },
                uRim: { value: color(0x2f5a14) },
            },
        }),
    );

    group.add(body, shell);
    return group;
}
