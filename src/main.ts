// Сцена с картой из сетки высот: изометрическая ортографическая камера, вращение мышью, масштаб колесом.

import * as THREE from 'three';
import { createTerrain } from './terrain';
import { controls } from './controls';
import { setTuftDensity, setTuftSeed, tuftTime } from './tufts';

const PITCH = THREE.MathUtils.degToRad(30);
const DISTANCE = 10;

let yaw = Math.PI / 4;
let zoom = 3.8;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdfe9ee);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
const target = new THREE.Vector3(0, 1, 0);

// Сетка высот: площадка 5×5 и Г-образный второй ярус, чтобы видеть и стыки на одном уровне, и уступ с внутренним углом.
const MAP = {
    w: 5,
    d: 5,
    heights: [1, 1, 1, 1, 1, 1, 2, 2, 2, 1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1],
};
const terrain = createTerrain(MAP);
scene.add(terrain.group);

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
    controls.seed.value = v;
    setTuftSeed(v);
});
bind('variation', (v) => (controls.variation.value = v));
bind('density', setTuftDensity);
bind('stone', (v) => (controls.stoneScale.value = v));
bind('drip', (v) => (controls.drip.value = v));
bind('shadow', (v) => (controls.shadow.value = v));
bind('fringeShadow', (v) => (controls.fringeShadow.value = v));
bind('round', (v) => terrain.setStoneRadius(v / 100));

placeCamera();
resize();
renderer.setAnimationLoop((t) => {
    tuftTime.value = t / 1000;
    renderer.render(scene, camera);
});
