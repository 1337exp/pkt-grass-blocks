// Сцена, общая для игры и редактора: рендерер, свет, камера (изометрия или вид сверху, поворот шагами по 90°, масштаб, сдвиг),
// свечение (блум) и «монитор» (сканлайны, виньетка), подписи над юнитами (CSS2D) и мышь: протяжка ПКМ или СКМ двигает камеру,
// а щелчки, наведение и протяжка ЛКМ уходят приложению через колбэки. Поле (Board) приложение отдаёт через setBoard.

import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { Board } from './board';
import { CameraRig, VIEW_HALF } from './cameraRig';

/** С какого сдвига мыши (px) нажатие считается протяжкой, а не щелчком. */
const DRAG_PX = 4;

export interface StageHandlers {
    /** Щелчок без протяжки (кнопка 0 — ЛКМ, 2 — ПКМ). */
    click?(e: PointerEvent, button: number): void;
    /** Курсор двигается без зажатых кнопок или с ЛКМ (`dragging` — ЛКМ зажата и уже тянется). */
    hover?(e: PointerEvent, dragging: boolean): void;
    /** ЛКМ нажата (для кисти: красить с первой клетки, не дожидаясь протяжки). */
    down?(e: PointerEvent, button: number): void;
    /** Кнопка отпущена (после щелчка или протяжки). */
    up?(e: PointerEvent, button: number): void;
    leave?(): void;
}

export class Stage {
    readonly renderer: THREE.WebGLRenderer;
    readonly scene = new THREE.Scene();
    readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    readonly screenPass: ShaderPass;
    /** Куда смотрит камера (cameraRig.ts); сцена только ставит по ней настоящую камеру. */
    readonly rig = new CameraRig();
    handlers: StageHandlers = {};
    private readonly labels = new CSS2DRenderer();
    private readonly composer: EffectComposer;
    private board: Board | null = null;
    private readonly keys = new Set<string>();
    private readonly drag = { button: -1, x: 0, y: 0, moved: false };
    private readonly ndc = new THREE.Vector2();
    private readonly timer = new THREE.Timer();
    /** Что сделать, когда интро кончится (старт матча: выбор первого игрока и наезд на него). */
    private introDone: (() => void) | null = null;

    constructor(private readonly host: HTMLElement) {
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
        host.appendChild(this.renderer.domElement);
        this.labels.domElement.className = 'labels';
        host.appendChild(this.labels.domElement);

        this.scene.background = new THREE.Color(0x05080d);
        this.scene.add(new THREE.HemisphereLight(0x9fc4ff, 0x10141c, 1.2));
        const sun = new THREE.DirectionalLight(0xcfe2ff, 1.2);
        sun.position.set(6, 12, 4);
        this.scene.add(sun);

        // своя цель отрисовки со сглаживанием: по умолчанию у EffectComposer его нет, и однопиксельные линии сетки при зуме и
        // движении камеры то попадают в пиксель, то пропадают (мерцание). HalfFloat: блуму нужны яркости выше 1
        this.composer = new EffectComposer(this.renderer, new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType }));
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        // умеренно: свечение должно подчёркивать, а не слепить (на максимуме подсветка превращалась в ёлку)
        this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.35, 0.4));
        this.composer.addPass(new OutputPass());
        // «монитор»: еле заметные сканлайны и виньетка поверх готового кадра (после перевода в sRGB, так проще дозировать)
        this.screenPass = new ShaderPass({
            uniforms: { tDiffuse: { value: null }, uLines: { value: 0.07 }, uVignette: { value: 0.32 } },
            vertexShader: /* glsl */ `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }`,
            fragmentShader: /* glsl */ `
                uniform sampler2D tDiffuse;
                uniform float uLines;
                uniform float uVignette;
                varying vec2 vUv;
                void main() {
                    vec3 c = texture2D(tDiffuse, vUv).rgb;
                    float scan = 0.5 + 0.5 * sin(gl_FragCoord.y * 3.14159 * 0.5); // полоса через пару пикселей
                    c *= 1.0 - uLines * scan;
                    vec2 p = vUv * 2.0 - 1.0;
                    c *= 1.0 - uVignette * smoothstep(0.5, 1.45, length(p));
                    gl_FragColor = vec4(c, 1.0);
                }`,
        });
        this.composer.addPass(this.screenPass);

        // размер берём у места на странице, а не у окна: в редакторе сцена стоит между панелями
        new ResizeObserver(() => this.resize()).observe(host);
        this.bindInput();
        this.resize();
    }

    get canvas(): HTMLCanvasElement {
        return this.renderer.domElement;
    }

    /** Поле на сцене (прежнее убирается; освобождать его ресурсы — дело того, кто его создал). */
    setBoard(board: Board): void {
        if (this.board) this.scene.remove(this.board.root);
        this.board = board;
        this.scene.add(board.root);
        this.resize();
    }

    /** Вид сверху или изометрия (подробности в `CameraRig.setTopView`). */
    setTopView(on: boolean): void {
        this.rig.setTopView(on);
    }

    /**
     * Интро уровня (проба): камера делает полный оборот и чуть наезжает, пока не встанет на обычный вид (быстро в начале, мягко в конце),
     * а поле строится: земля колоннами, фигуры падают сверху (board/intro.ts). Любой щелчок, клавиша или колесо пропускают его.
     * Камера всё интро смотрит в центр поля: к игроку она переходит уже после, в `onDone` (досрочный пропуск тоже его зовёт).
     */
    playIntro(seconds = 4.2, onDone?: () => void): void {
        this.introDone = onDone ?? null;
        this.rig.playIntro(seconds);
        this.board?.setIntro(0);
    }

    /** Закончить интро сразу: камера на обычном месте. */
    skipIntro(): void {
        if (!this.rig.skipIntro()) return;
        this.board?.setIntro(null);
        this.finishIntro();
    }

    /** Интро закончилось (само или пропущено): отдать управление дальше, один раз. */
    private finishIntro(): void {
        const done = this.introDone;
        this.introDone = null;
        done?.();
    }

    /** Мировая точка в координаты страницы в пикселях (для наложения HTML на сцену). */
    project(p: THREE.Vector3): { x: number; y: number } {
        const v = p.clone().project(this.camera);
        const r = this.host.getBoundingClientRect();
        return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (0.5 - v.y * 0.5) * r.height };
    }

    get topView(): boolean {
        return this.rig.topView;
    }

    /** Нормализованные координаты (−1..1) курсора на холсте. */
    ndcOf(e: PointerEvent): THREE.Vector2 {
        const r = this.canvas.getBoundingClientRect();
        return this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    }

    /** Клетка под курсором (индекс) по полю. */
    pickCell(e: PointerEvent): number | null {
        return this.board?.pick(this.ndcOf(e), this.camera) ?? null;
    }

    /** Клетка на уровне земли под курсором, в том числе вне карты. */
    pickGround(e: PointerEvent): { x: number; z: number } | null {
        return this.board?.groundCell(this.ndcOf(e), this.camera) ?? null;
    }

    /** Клетка под курсором и точка попадания в мире (или null). */
    pickHit(e: PointerEvent): { i: number; point: THREE.Vector3 } | null {
        return this.board?.pickHit(this.ndcOf(e), this.camera) ?? null;
    }

    /** Камера плавно наезжает на точку мира (как в FM3 при выборе юнита). */
    focus(p: THREE.Vector3): void {
        this.rig.focus(p);
    }

    /** Сдвиг цели камеры на (dx, dy) пикселей экрана: по земле, с учётом поворота и наклона. */
    pan(dxPx: number, dyPx: number): void {
        const lim = this.board ? Math.max(this.board.map.w, this.board.map.d) / 2 : 20;
        this.rig.pan(dxPx, dyPx, this.host.clientHeight, lim);
    }

    /**
     * Цикл кадров. `tick(dt, real)`: `dt` не больше 0,05 с — для движения (после подвисания ничто не телепортируется); `real` —
     * настоящее время кадра для шейдеров (волна радиуса, вода, развёртка), иначе при редких кадрах они бы отставали.
     */
    run(tick: (dt: number, real: number) => void): void {
        this.renderer.setAnimationLoop((now) => {
            this.timer.update(now);
            const real = Math.min(1, this.timer.getDelta());
            const dt = Math.min(0.05, real);
            const { keys } = this;
            // поворот, наклон и цель плавно догоняют желаемое (шаг 90°), как вращение карты в FM3; во время интро камеру ведёт оно
            const introK = this.rig.update(dt, real);
            if (introK !== null) {
                this.board?.setIntro(introK);
                if (introK >= 1) this.finishIntro();
            }
            const speed = 900 * dt; // пикселей экрана за кадр при зажатой клавише
            const kx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
            const ky = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
            if (kx || ky) this.pan(-kx * speed, -ky * speed);
            tick(dt, real);
            this.rig.place(this.camera);
            this.board?.setView(this.rig.yaw, this.rig.pitch, this.rig.zoom);
            this.board?.update(real);
            this.composer.render(dt);
            this.labels.render(this.scene, this.camera);
        });
    }

    private resize(): void {
        const w = this.host.clientWidth;
        const h = this.host.clientHeight;
        this.renderer.setSize(w, h);
        this.composer.setPixelRatio(this.renderer.getPixelRatio());
        this.composer.setSize(w, h);
        const buf = this.renderer.getDrawingBufferSize(new THREE.Vector2());
        this.board?.setResolution(buf.x, buf.y, buf.x / w);
        this.labels.setSize(w, h);
        const a = w / h;
        Object.assign(this.camera, { left: -VIEW_HALF * a, right: VIEW_HALF * a, top: VIEW_HALF, bottom: -VIEW_HALF });
        this.camera.updateProjectionMatrix();
    }

    private bindInput(): void {
        const { canvas, drag } = this;
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        canvas.addEventListener('pointerdown', (e) => {
            // нажатие, пропустившее интро, только пропускает: иначе тот же щелчок сразу снимет выбор первого игрока
            if (this.rig.introActive) return this.skipIntro();
            Object.assign(drag, { button: e.button, x: e.clientX, y: e.clientY, moved: false });
            canvas.setPointerCapture(e.pointerId);
            this.handlers.down?.(e, e.button);
        });
        canvas.addEventListener('pointermove', (e) => {
            const dx = e.clientX - drag.x;
            const dy = e.clientY - drag.y;
            if (drag.button !== -1 && !drag.moved && Math.hypot(dx, dy) >= DRAG_PX) drag.moved = true;
            if ((drag.button === 1 || drag.button === 2) && drag.moved) {
                this.pan(dx, dy);
                drag.x = e.clientX;
                drag.y = e.clientY;
                return;
            }
            this.handlers.hover?.(e, drag.button === 0 && drag.moved);
        });
        canvas.addEventListener('pointerup', (e) => {
            const b = drag.button;
            const moved = drag.moved;
            drag.button = -1;
            if (!moved) this.handlers.click?.(e, b);
            this.handlers.up?.(e, b);
        });
        canvas.addEventListener('pointerleave', () => this.handlers.leave?.());
        canvas.addEventListener(
            'wheel',
            (e) => {
                e.preventDefault();
                if (this.rig.introActive) return this.skipIntro();
                this.rig.zoomBy(e.deltaY);
            },
            { passive: false },
        );
        // клавиши камеры; не мешаем полям ввода HUD и сочетаниям с Ctrl (Ctrl+S не должен ещё и двигать камеру)
        const own = (e: KeyboardEvent): boolean => !e.ctrlKey && !e.metaKey && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement);
        window.addEventListener('keydown', (e) => {
            if (!own(e)) return;
            this.skipIntro();
            this.keys.add(e.code);
            if (e.code === 'KeyQ') this.rig.rotate(-1);
            else if (e.code === 'KeyE') this.rig.rotate(1);
        });
        window.addEventListener('keyup', (e) => this.keys.delete(e.code));
        window.addEventListener('blur', () => this.keys.clear());
    }
}
