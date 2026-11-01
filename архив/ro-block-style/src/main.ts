// Сцена с одним блоком: изометрическая ортографическая камера, вращение мышью, масштаб колесом.

import * as THREE from 'three';
import { createBlock } from './block';

const PITCH = THREE.MathUtils.degToRad(30);
const DISTANCE = 10;

let yaw = Math.PI / 4;
let zoom = 2.2;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdfe9ee);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
const target = new THREE.Vector3(0, 0.6, 0);

scene.add(createBlock());

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

placeCamera();
resize();
renderer.setAnimationLoop(() => renderer.render(scene, camera));
