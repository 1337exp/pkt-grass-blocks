// Сцена с одним блоком: изометрическая ортографическая камера, вращение мышью, масштаб колесом.

import * as THREE from 'three';
import { createBlock } from './block';
import { controls } from './controls';
import { setTuftDensity, setTuftSeed, tuftTime } from './tufts';

const PITCH = THREE.MathUtils.degToRad(30);
const DISTANCE = 10;

let yaw = Math.PI / 4;
let zoom = 3.4;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdfe9ee);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
const target = new THREE.Vector3(0, 0.6, 0);

// Площадка 3×3, чтобы сравнивать блоки рядом.
const blocks: THREE.Group[] = [];
for (let x = -1; x <= 1; x++) {
    for (let z = -1; z <= 1; z++) {
        const block = createBlock(x, z);
        blocks.push(block);
        scene.add(block);
    }
}

const hash = (n: number): number => {
    const v = Math.sin(n * 127.1) * 43758.5453;
    return v - Math.floor(v);
};

let seed = 0;
let variation = 0.6;

/** Оттенок травы каждого блока: от жёлтой до тёмной, зависит от зерна и от разброса. */
function retint(): void {
    blocks.forEach((block, i) => {
        const yellow = (hash(i * 3 + seed * 7.1) * 2 - 1) * variation;
        const bright = (hash(i * 5 + seed * 3.7 + 1.3) * 2 - 1) * variation;
        const k = 1 + 0.18 * bright;
        (block.userData.tint as THREE.Vector3).set(k * (1 + 0.25 * yellow), k * (1 + 0.05 * yellow), k * (1 - 0.35 * yellow));
    });
}

function placeCamera(): void {
    const c = Math.cos(PITCH);
    camera.position.set(
        target.x + Math.sin(yaw) * c * DISTANCE,
        target.y + Math.sin(PITCH) * DISTANCE,
        target.z + Math.cos(yaw) * c * DISTANCE,
    );
    camera.lookAt(target);
}

function resize(): void {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    renderer.setSize(w, h, false);
    const aspect = w / h;
    camera.left = -zoom * aspect;
    camera.right = zoom * aspect;
    camera.top = zoom;
    camera.bottom = -zoom;
    camera.updateProjectionMatrix();
}

let dragging = false;
renderer.domElement.addEventListener('pointerdown', (e) => {
    dragging = true;
    renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener('pointerup', () => {
    dragging = false;
});
renderer.domElement.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    yaw -= e.movementX * 0.008;
    placeCamera();
});
renderer.domElement.addEventListener(
    'wheel',
    (e) => {
        e.preventDefault();
        zoom = THREE.MathUtils.clamp(zoom * Math.exp(e.deltaY * 0.001), 0.8, 6);
        resize();
    },
    { passive: false },
);
window.addEventListener('resize', resize);

function bind(id: string, apply: (v: number) => void): void {
    const input = document.getElementById(id) as HTMLInputElement;
    const out = input.nextElementSibling as HTMLOutputElement;
    const sync = (): void => {
        out.textContent = input.value;
        apply(Number(input.value));
    };
    input.addEventListener('input', sync);
    sync();
}

bind('wind', (v) => (controls.wind.value = v));
bind('seed', (v) => {
    seed = v;
    setTuftSeed(v);
    retint();
});
bind('variation', (v) => {
    variation = v;
    retint();
});
bind('density', setTuftDensity);
bind('stone', (v) => (controls.stoneScale.value = v));
bind('drip', (v) => (controls.drip.value = v));

placeCamera();
resize();
renderer.setAnimationLoop((t) => {
    tuftTime.value = t / 1000;
    renderer.render(scene, camera);
});
