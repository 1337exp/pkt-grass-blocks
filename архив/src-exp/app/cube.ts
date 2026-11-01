// Соседняя сцена: один куб травы. Камень — тело, шапка — объём сверху, свисающие пряди — объём вниз.
// Камера стоит в изометрии, крутится сам куб, по часовой если смотреть сверху.

import * as THREE from 'three';

const PITCH = 0.62;
const YAW = Math.PI / 4;
const TURN = -0.22;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ec4e4);

const host = document.body;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
host.appendChild(renderer.domElement);

const camera = new THREE.OrthographicCamera(-2.2, 2.2, 2.2, -2.2, 0.1, 40);
placeCamera();

const sun = new THREE.DirectionalLight(0xfff1d6, 2.1);
sun.position.set(2.2, 3.4, 1.4);
const ambient = new THREE.HemisphereLight(0xd7ecff, 0x4a5a32, 0.55);
scene.add(sun, ambient);

const cube = new THREE.Group();
cube.position.y = -0.5;
scene.add(cube);

const loader = new THREE.TextureLoader();

void start();

async function start(): Promise<void> {
    const stone = await colorMap('/tiles/cliff-rock.jpg');
    const turf = await colorMap('/tiles/grass-top.jpg');
    const hang = await cutoutMap('/tiles/grass-hang.jpg');
    cube.add(stoneBody(stone), grassCap(turf), hangingGrass(hang));
    resize();
    window.addEventListener('resize', resize);
    let last = performance.now();
    const tick = (now: number): void => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        cube.rotation.y += TURN * dt;
        renderer.render(scene, camera);
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}

function stoneBody(map: THREE.Texture): THREE.Mesh {
    const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.94, metalness: 0, flatShading: true });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 0.78, 1), mat);
    mesh.position.y = 0.39;
    return mesh;
}

/** Только верх: ковёр шире камня и вспучен. Боков у шапки нет — их закрывают пряди. */
function grassCap(map: THREE.Texture): THREE.Group {
    const group = new THREE.Group();
    const geo = new THREE.PlaneGeometry(1.22, 1.22, 14, 14);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const color = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        const n = noise(x * 4.2, z * 4.2);
        const rim = Math.max(Math.abs(x) / 0.61, Math.abs(z) / 0.61);
        pos.setY(i, 0.08 + n * 0.12 - Math.max(0, rim - 0.78) * 0.18);
        if (rim > 0.84) {
            pos.setX(i, x * (1.04 + n * 0.05));
            pos.setZ(i, z * (1.04 + n * 0.05));
        }
        const shade = 0.78 + n * 0.22;
        color[i * 3] = 0.62 * shade;
        color[i * 3 + 1] = shade;
        color[i * 3 + 2] = 0.32 * shade;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(color, 3));
    geo.computeVertexNormals();
    const top = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.86, metalness: 0, side: THREE.DoubleSide }),
    );
    top.position.y = 0.78;
    const under = new THREE.Mesh(
        new THREE.PlaneGeometry(1.2, 1.2),
        new THREE.MeshStandardMaterial({ color: 0x2a3d18, roughness: 1, metalness: 0, side: THREE.DoubleSide }),
    );
    under.rotation.x = Math.PI / 2;
    under.position.y = 0.775;
    group.add(top, under);
    return group;
}

/** Пряди по кромке шапки. Фон картинки выбит, поэтому видны только листья, и они дают объём вниз. */
function hangingGrass(map: THREE.Texture): THREE.Group {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
        map,
        transparent: true,
        alphaTest: 0.28,
        side: THREE.DoubleSide,
        roughness: 0.9,
        metalness: 0,
    });
    const faces: [number, number][] = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
    ];
    for (const [nx, nz] of faces) {
        for (let k = 0; k < 5; k++) {
            const along = (k - 2) * 0.2;
            const w = 0.34 + hash(k + nx * 7 + nz * 13) * 0.16;
            const h = 0.55 + hash(k + 20) * 0.42;
            const card = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
            card.position.set(nx * 0.56 + nz * along, 0.78 - h * 0.38, nz * 0.56 + nx * along);
            if (nx) card.rotation.y = Math.PI / 2;
            card.rotation.x = (hash(k + 3) - 0.5) * 0.12;
            card.rotation.z = nx * 0.08 + (hash(k + 8) - 0.5) * 0.08;
            group.add(card);
        }
    }
    return group;
}

function colorMap(url: string): Promise<THREE.Texture> {
    return loader.loadAsync(url).then((tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        return tex;
    });
}

/** Фон (светлый или магента) становится дырой, остаётся зелень прядей. */
async function cutoutMap(url: string): Promise<THREE.Texture> {
    const image = await loadImage(url);
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return colorMap(url);
    ctx.drawImage(image, 0, 0, size, size);
    const pix = ctx.getImageData(0, 0, size, size);
    const d = pix.data;
    for (let i = 0; i < d.length; i += 4) {
        const r = d[i] ?? 0;
        const g = d[i + 1] ?? 0;
        const b = d[i + 2] ?? 0;
        const green = g - Math.max(r, b);
        const light = (r + g + b) / 3;
        d[i + 3] = green > 12 && light < 230 ? 255 : 0;
    }
    ctx.putImageData(pix, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
}

function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(url));
        img.src = url;
    });
}

function noise(x: number, z: number): number {
    return (
        Math.sin(x * 1.7 + z * 0.9) * 0.37 +
        Math.sin(x * 3.1 - z * 2.4) * 0.28 +
        Math.sin(x * 6.2 + z * 5.1) * 0.18 +
        0.5
    );
}

function hash(n: number): number {
    const x = Math.sin(n * 127.1) * 43758.5453;
    return x - Math.floor(x);
}

function placeCamera(): void {
    const c = Math.cos(PITCH);
    camera.position.set(Math.sin(YAW) * c * 8, Math.sin(PITCH) * 8, Math.cos(YAW) * c * 8);
    camera.lookAt(0, 0.2, 0);
    camera.updateProjectionMatrix();
}

function resize(): void {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    renderer.setSize(w, h, false);
    const aspect = w / h;
    camera.left = -2.2 * aspect;
    camera.right = 2.2 * aspect;
    camera.top = 2.2;
    camera.bottom = -2.2;
    camera.updateProjectionMatrix();
}
