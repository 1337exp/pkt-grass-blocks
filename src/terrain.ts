// Карта целиком: каменное тело, травяная оболочка и травинки. Камень и оболочка строятся из одной сетки высот.

import * as THREE from 'three';
import { controls } from './controls';
import { grass, stone, vertex } from './shaders';
import { type HeightMap, buildSkin } from './skin';
import { createTufts } from './tufts';

/** Насколько оболочка выступает над краем и выше верха камня. */
const PAD = 0.05;
const LIFT = 0.05;
const RADIUS = 0.13;
/** Радиус скругления камня в долях клетки, как border-radius в процентах. */
const STONE_RADIUS = 0.2;

const color = (hex: number): THREE.Color => new THREE.Color(hex);

const loader = new THREE.TextureLoader();
const tiles = new Map<string, THREE.Texture>();

/** Нарисованная плитка из public/tex: повторяется, цвет читается как sRGB. */
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

export interface Terrain {
    group: THREE.Group;
    /** Пересобирает камень с новым радиусом скругления открытых рёбер, в долях клетки. */
    setStoneRadius: (radius: number) => void;
}

export function createTerrain(map: HeightMap): Terrain {
    const group = new THREE.Group();

    const shared = { uSeed: controls.seed, uVariation: controls.variation, uDrip: controls.drip, uShadow: controls.shadow, uFringeShadow: controls.fringeShadow };

    // Камень без навеса и с лёгким скруглением только открытых рёбер: внутренних швов нет, внешние грани соседей лежат в одной плоскости.
    const body = new THREE.Mesh(
        buildSkin(map, { pad: 0, lift: LIFT, radius: STONE_RADIUS }),
        new THREE.ShaderMaterial({
            vertexShader: vertex,
            fragmentShader: stone,
            uniforms: {
                ...shared,
                uStoneMap: { value: tile('stone-wall') },
                uStoneScale: controls.stoneScale,
                uRoot: { value: color(0x2b2418) },
            },
        }),
    );

    const shell = new THREE.Mesh(
        buildSkin(map, { pad: PAD, lift: LIFT, radius: RADIUS }),
        new THREE.ShaderMaterial({
            vertexShader: vertex,
            fragmentShader: grass,
            uniforms: {
                ...shared,
                uTopMap: { value: tile('grass-top') },
                uSideMap: { value: tile('grass-side') },
                uDeep: { value: color(0x4f8f1c) },
                uRim: { value: color(0x2f5a14) },
            },
        }),
    );

    group.add(body, shell, createTufts(map, PAD, LIFT));

    const setStoneRadius = (radius: number): void => {
        body.geometry.dispose();
        body.geometry = buildSkin(map, { pad: 0, lift: LIFT, radius });
    };
    return { group, setStoneRadius };
}
