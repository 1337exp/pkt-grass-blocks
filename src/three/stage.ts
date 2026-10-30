// Сцена: орбита, вид сверху, солнце по часу и луч в грань. Vue сюда не входит.

import * as THREE from 'three';
import { bounds, type World } from '@core/world';
import { buildWorldMesh, type PickFace } from './mesh';
import { skyTint, sunAt } from './sky';

const HALF = 12;
const PITCH_ISO = 0.62;
const PITCH_TOP = Math.PI / 2 - 0.001;
const ROTATE = Math.PI / 4;
const DISTANCE = 48;

export interface WorldHit {
    face: PickFace;
    point: THREE.Vector3;
    /** Луч не попал в блок и пересёк плоскость y = 0. */
    ground: boolean;
}

export class Stage {
    readonly renderer: THREE.WebGLRenderer;
    readonly camera: THREE.OrthographicCamera;
    hour = 12;
    private readonly scene = new THREE.Scene();
    private readonly worldGroup = new THREE.Group();
    private readonly sun = new THREE.DirectionalLight(0xfff4e0, 2);
    private readonly ambient = new THREE.HemisphereLight(0xbfd4ea, 0x3d4a32, 0.4);
    private readonly ray = new THREE.Raycaster();
    private readonly pointer = new THREE.Vector2();
    private yaw = Math.PI / 4;
    private pitch = PITCH_ISO;
    private zoom = 1;
    private readonly target = new THREE.Vector3();
    private running = false;
    private last = 0;
    private cycleHours = 0;
    private block = 1;
    private frameId = 0;

    constructor(private readonly host: HTMLElement) {
        const canvas = document.createElement('canvas');
        canvas.style.display = 'block';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        host.appendChild(canvas);
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.camera = new THREE.OrthographicCamera(-HALF, HALF, HALF, -HALF, 0.1, 200);
        this.sun.castShadow = true;
        this.sun.shadow.mapSize.set(2048, 2048);
        this.sun.shadow.bias = -0.0004;
        this.scene.add(this.ambient, this.sun, this.sun.target, this.worldGroup);
        this.resize();
    }

    setWorld(world: World, frame = false): void {
        this.disposeGroup(this.worldGroup);
        this.worldGroup.add(buildWorldMesh(world));
        this.worldGroup.add(buildProps(world));
        this.block = world.block;
        this.cycleHours = world.sky.cycleHours;
        this.hour = world.sky.hour;
        this.applySky();
        this.fitShadows(world);
        if (frame) this.frame(world);
    }

    setHour(hour: number): void {
        this.hour = ((hour % 24) + 24) % 24;
        this.applySky();
    }

    setCycle(cycleHours: number): void {
        this.cycleHours = Math.max(0, cycleHours);
    }

    get topView(): boolean {
        return this.pitch > 1.2;
    }
    rotate(steps: number): void {
        this.yaw += steps * ROTATE;
        this.place();
    }

    setTop(on: boolean): void {
        const top = this.pitch > 1.2;
        if (on === top) return;
        this.pitch = on ? PITCH_TOP : PITCH_ISO;
        this.yaw += on ? -ROTATE : ROTATE;
        this.place();
    }

    zoomBy(deltaY: number): void {
        this.zoom = THREE.MathUtils.clamp(this.zoom * Math.exp(-deltaY * 0.0012), 0.35, 4);
        this.place();
    }

    pan(dxPx: number, dyPx: number): void {
        const perPx = (2 * HALF) / this.zoom / Math.max(1, this.host.clientHeight);
        const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
        const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
        this.target.addScaledVector(right, -dxPx * perPx).addScaledVector(fwd, (dyPx * perPx) / Math.sin(this.pitch));
        this.place();
    }

    orbit(dxPx: number, dyPx: number): void {
        this.yaw -= dxPx * 0.005;
        this.pitch = THREE.MathUtils.clamp(this.pitch + dyPx * 0.004, 0.25, PITCH_TOP);
        this.place();
    }

    pick(clientX: number, clientY: number): WorldHit | null {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        this.ray.setFromCamera(this.pointer, this.camera);
        const hits = this.ray.intersectObjects(this.worldGroup.children, true);
        for (const hit of hits) {
            const picks = hit.object.userData.picks as PickFace[] | undefined;
            if (!picks || hit.faceIndex == null) continue;
            const face = picks[hit.faceIndex];
            if (face) return { face, point: hit.point.clone(), ground: false };
        }
        const ground = new THREE.Vector3();
        if (!this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), ground)) return null;
        return {
            face: { x: Math.floor(ground.x / this.block), y: -1, z: Math.floor(ground.z / this.block), nx: 0, ny: 1, nz: 0, spanY0: -1, material: '', kind: 'top' },
            point: ground,
            ground: true,
        };
    }

    start(): void {
        if (this.running) return;
        this.running = true;
        this.last = performance.now();
        const loop = (now: number) => {
            if (!this.running) return;
            const dt = Math.min(0.05, (now - this.last) / 1000);
            this.last = now;
            if (this.cycleHours > 0) {
                this.hour = (this.hour + (dt / 3600 / this.cycleHours) * 24) % 24;
                this.applySky();
            }
            this.renderer.render(this.scene, this.camera);
            this.frameId = requestAnimationFrame(loop);
        };
        this.frameId = requestAnimationFrame(loop);
    }

    resize(): void {
        const w = Math.max(1, this.host.clientWidth);
        const h = Math.max(1, this.host.clientHeight);
        this.renderer.setSize(w, h, false);
        const aspect = w / h;
        this.camera.left = -HALF * aspect;
        this.camera.right = HALF * aspect;
        this.camera.top = HALF;
        this.camera.bottom = -HALF;
        this.place();
    }

    dispose(): void {
        this.running = false;
        cancelAnimationFrame(this.frameId);
        this.disposeGroup(this.worldGroup);
        this.renderer.dispose();
        this.renderer.domElement.remove();
    }

    private frame(world: World): void {
        const box = bounds(world);
        if (!box) {
            this.target.set(0, 0, 0);
            this.zoom = 1;
        } else {
            const s = world.block;
            this.target.set(((box.x0 + box.x1 + 1) / 2) * s, ((box.y0 + box.y1) / 2) * s, ((box.z0 + box.z1 + 1) / 2) * s);
            const size = Math.max(box.x1 - box.x0 + 3, box.z1 - box.z0 + 3, box.y1) * s;
            this.zoom = THREE.MathUtils.clamp((HALF * 1.7) / size, 0.35, 4);
        }
        this.place();
    }

    private place(): void {
        const c = Math.cos(this.pitch);
        this.camera.position.set(
            this.target.x + Math.sin(this.yaw) * c * DISTANCE,
            this.target.y + Math.sin(this.pitch) * DISTANCE,
            this.target.z + Math.cos(this.yaw) * c * DISTANCE,
        );
        this.camera.up.set(-Math.sin(this.yaw), Math.cos(this.pitch) > 0.05 ? 1 : 0, -Math.cos(this.yaw)).normalize();
        this.camera.lookAt(this.target);
        this.camera.zoom = this.zoom;
        this.camera.updateProjectionMatrix();
        this.sun.position.set(this.target.x, this.target.y, this.target.z).addScaledVector(this.sunDir(), DISTANCE * 0.6);
        this.sun.target.position.copy(this.target);
        this.sun.target.updateMatrixWorld();
    }

    private sunDir(): THREE.Vector3 {
        const sun = sunAt(this.hour);
        return new THREE.Vector3(sun.x, Math.max(sun.y, 0.18), sun.z).normalize();
    }

    private applySky(): void {
        const sun = sunAt(this.hour);
        const tint = skyTint(sun.elevation);
        this.scene.background = new THREE.Color(tint.background);
        this.scene.fog = new THREE.Fog(tint.fog, 28, 90);
        this.sun.color.setHex(tint.sun);
        this.sun.intensity = tint.intensity;
        this.ambient.intensity = tint.ambient;
        this.ambient.color.setHex(tint.background);
        this.place();
    }

    private fitShadows(world: World): void {
        const box = bounds(world);
        const span = box ? Math.max(box.x1 - box.x0, box.z1 - box.z0, 8) * world.block + 6 : 20;
        const cam = this.sun.shadow.camera as THREE.OrthographicCamera;
        cam.left = -span;
        cam.right = span;
        cam.top = span;
        cam.bottom = -span;
        cam.near = 0.5;
        cam.far = DISTANCE * 2;
        cam.updateProjectionMatrix();
    }

    private disposeGroup(group: THREE.Group): void {
        const materials = new Set<THREE.Material>();
        for (const child of [...group.children]) {
            group.remove(child);
            child.traverse((obj) => {
                const mesh = obj as THREE.Mesh;
                mesh.geometry?.dispose();
                const material = mesh.material;
                if (Array.isArray(material)) material.forEach((m) => materials.add(m));
                else if (material) materials.add(material);
            });
        }
        materials.forEach((m) => m.dispose());
    }
}

function buildProps(world: World): THREE.Group {
    const group = new THREE.Group();
    group.name = 'props';
    const s = world.block;
    const bark = new THREE.MeshStandardMaterial({ color: 0x6b4a30, roughness: 0.9 });
    const leaves = new THREE.MeshStandardMaterial({ color: 0x3f7a32, roughness: 0.8 });
    const crate = new THREE.MeshStandardMaterial({ color: 0x9a6a3c, roughness: 0.75 });
    const plain = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.8 });
    for (const prop of world.props) {
        const root = new THREE.Group();
        root.position.set((prop.x + 0.5) * s, prop.y * s, (prop.z + 0.5) * s);
        root.rotation.y = prop.yaw * (Math.PI / 2);
        if (prop.type === 'tree') {
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.7, 6), bark);
            trunk.position.y = 0.35;
            const crown = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.7, 7), leaves);
            crown.position.y = 1.45;
            root.add(trunk, crown);
        } else if (prop.type === 'crate') {
            const box = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.72, 0.72), crate);
            box.position.y = 0.36;
            root.add(box);
        } else {
            const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), plain);
            box.position.y = 0.3;
            root.add(box);
        }
        root.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            if (!mesh.isMesh) return;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.raycast = () => {};
        });
        group.add(root);
    }
    return group;
}
