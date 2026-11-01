// Поле в стиле «тактический дисплей» (STYLE.md): рельеф почти чёрный, по верху клеток тонкая сетка, уступы отмечены краями и
// гаснущими книзу вертикалями, вода со своими слоями, подсветка хода рамой. Board собирает слои из частей:
//
//   metrics.ts   где клетка в мире (центр, уровни, углы склонов)
//   geometry.ts  столбики, верх клеток, «юбки» склонов, края, вертикали — чистые функции «карта → меш»
//   ribbon.ts    линии-ленты одной толщины в пикселях (края, вертикали, подсказка)
//   water.ts     течение и тень берега
//   marks.ts     подсветка радиуса, пути (светлячки) и следа кисти
//   look.ts      общие uniform (размер кадра, толщина линий, цвета сетки)
//   shadows.ts   тени под фигурами
//   поверх поля: cursor.ts (курсор), attack.ts (линия атаки), hint.ts (подсказка редактора)
//   shaders/     шейдеры слоёв, textures.ts — зерно и рама
//
// Материалы и текстуры создаются один раз; геометрия пересобирается по карте (rebuild) — редактор зовёт это после каждой правки.

import * as THREE from 'three';
import { type Cell, foldDiagonal, type GridMap } from '../../core/grid';
import { AttackLine, type AttackOptions } from './attack';
import { PathPlaque, PITCH_ISO, type PlaquePart } from './plaque';
import { Cursor } from './cursor';
import { buildColumns, buildEdges, buildRisers, buildSkirts, buildTops } from './geometry';
import { EditHint, type HintTarget } from './hint';
import { applyIntro } from './intro';
import { GRID_LINE, Look } from './look';
import { type MarkCell, MarkLayer } from './marks';
import { LEVEL_H, Metrics } from './metrics';
import { type ShadowCaster, ShadowLayer } from './shadows';
import { ribbonMaterial } from './ribbon';
import { gridFrag, gridVert } from './shaders/grid';
import { sideFrag, sideVert } from './shaders/sides';
import { noiseTexture } from './textures';

export { LEVEL_H } from './metrics';

/** Фигура на поле: её клетка (логическая, для выбора) и место в мире с размером тени. */
export interface Piece extends ShadowCaster {
    cell: { x: number; z: number };
}

/**
 * На сколько выше столбик занятой клетки для выбора: четверть уровня (было целый уровень: при плотно стоящих юнитах невидимый столбик
 * перекрывал соседей и клетки выбирались плохо). Возможно, уберём совсем: выбрать цель можно вращением камеры, тактическим видом или
 * быстрым выбором (хоткеи, список, кнопка).
 */
const PICK_RAISE = LEVEL_H / 4;
export type { AttackOptions } from './attack';
export type { PlaquePart } from './plaque';
export type { HintTarget } from './hint';
export { type Mark, MARK_COLOR, type MarkCell } from './marks';

export class Board {
    readonly root = new THREE.Group();
    readonly look = new Look();
    private m: Metrics;
    /** Слои, собранные по карте: пересобираются целиком. */
    private terrain = new THREE.Group();
    /** Части поля, которыми управляет интро (board/intro.ts). */
    private parts: { columns: THREE.InstancedMesh; tops: THREE.InstancedMesh; lines: THREE.Object3D[] } | null = null;
    private introOn = false;
    private readonly mat: { side: THREE.ShaderMaterial; skirt: THREE.ShaderMaterial; grid: THREE.ShaderMaterial; edge: THREE.ShaderMaterial; riser: THREE.ShaderMaterial };
    private readonly marks: MarkLayer;
    private readonly cursor: Cursor;
    private readonly attack: AttackLine;
    private readonly pathPlaque: PathPlaque;
    private readonly hint: EditHint;
    private readonly ray = new THREE.Raycaster();
    /** Фигуры на поле (юниты, объекты): их клетки — для выбора, их места в мире — для теней. */
    private pieces: () => Piece[] = () => [];
    private readonly shadows = new ShadowLayer();
    private time = 0;
    /** Поворот и наклон камеры (задаёт Stage каждый кадр): плашки над целями следуют за ним. */
    private view = { yaw: 0, pitch: PITCH_ISO, zoom: 1 };

    constructor(map: GridMap) {
        this.m = new Metrics(map);
        const noise = noiseTexture();
        const { look } = this;
        const side = new THREE.ShaderMaterial({ vertexShader: sideVert, fragmentShader: sideFrag, uniforms: { uColor: { value: new THREE.Color(0x0e1828) }, uNoise: { value: noise } } });
        // «юбки» склонов — обычный меш, без инстансинга: та же заливка, шейдер без instanceMatrix, обе стороны треугольников
        const skirt = side.clone();
        skirt.side = THREE.DoubleSide;
        skirt.vertexShader = side.vertexShader.replace('modelMatrix * instanceMatrix', 'modelMatrix').replace('mat3(modelMatrix * instanceMatrix)', 'mat3(modelMatrix)');
        this.mat = {
            side,
            skirt,
            grid: new THREE.ShaderMaterial({
                vertexShader: gridVert,
                fragmentShader: gridFrag,
                uniforms: { uTime: { value: 0 }, uLine: { value: GRID_LINE }, uGridColor: look.gridColor, uLineW: look.lineW, uNoise: { value: noise }, ...look.view },
            }),
            edge: ribbonMaterial(look),
            riser: ribbonMaterial(look, { fade: 1 }),
        };

        this.marks = new MarkLayer(this.m);
        Object.assign(this.marks.material.uniforms, { uPx: look.view.uPx });
        this.cursor = new Cursor(look.view.uPx);
        this.attack = new AttackLine(this.root, look);
        this.pathPlaque = new PathPlaque(this.root);
        this.hint = new EditHint(this.root, look);

        this.root.add(this.terrain, this.shadows.mesh, this.marks.mesh, this.cursor.mesh);
        this.build();
    }

    get map(): GridMap {
        return this.m.map;
    }

    /**
     * Пересобрать поле по карте (после правки или с новой картой, например другого размера). Материалы, текстуры и настройки вида
     * остаются, подсветка, курсор и линии поверх поля сбрасываются.
     */
    rebuild(map: GridMap = this.map): void {
        this.disposeTerrain();
        this.m = new Metrics(map);
        this.marks.rebuild(this.m);
        this.cursor.set(this.m, null, false);
        this.attack.clear();
        this.hint.clear();
        this.build();
    }

    private build(): void {
        const { m, mat } = this;
        const columns = buildColumns(m, mat.side);
        const skirts = buildSkirts(m, mat.skirt);
        const tops = buildTops(m, mat.grid);
        const edges = buildEdges(m, mat.edge);
        const risers = buildRisers(m, mat.riser);
        this.terrain.add(columns, skirts, tops, edges, risers);
        this.parts = { columns, tops, lines: [skirts, edges, risers] };
    }

    private disposeTerrain(): void {
        for (const o of [...this.terrain.children]) {
            (o as THREE.Mesh).geometry.dispose();
            o.removeFromParent();
        }
    }

    //---]> где клетка (для юнитов, камеры, игры)

    center(c: { x: number; z: number }): { x: number; z: number } {
        return this.m.center(c);
    }

    surface(c: Cell, lift = 0): THREE.Vector3 {
        return this.m.surface(c, lift);
    }

    //---]> подсветка, курсор, линии поверх поля

    /**
     * Подсветка клеток. `dist` — расстояние от юнита (по нему волна проявления), `key` меняется только при новом радиусе: тогда
     * волна запускается заново, а смена пути под курсором её не перезапускает.
     */
    setMarks(list: MarkCell[], key: string, origin: number | null = null): void {
        this.marks.set(list, key, this.time, origin);
    }

    /** Курсор на клетке (null: убрать); `goal` — это цель пути (сейчас курсор от этого не меняется, см. cursor.ts). */
    setHover(i: number | null, goal = false): void {
        this.cursor.set(this.m, i === null ? null : this.map.cells[i]!, goal);
    }

    /** Подсказка редактора на клетке `i`: край или угол, который изменит щелчок (null — убрать). */
    setEditHint(i: number | null, t: HintTarget | null): void {
        this.hint.set(this.m, i === null ? null : this.map.cells[i]!, t);
    }

    /** Линия атаки от клетки `from` к клетке `to` на высоте `lift` (null — убрать); дуга, преграда, помехи — см. AttackLine. */
    setAttack(from: number | null, to: number | null, lift: number | [number, number], opts?: AttackOptions): void {
        this.attack.set(this.m, from === null ? null : this.map.cells[from]!, to === null ? null : this.map.cells[to]!, lift, opts);
    }

    /** Плашка над клеткой цели хода (цена пути в ОД; null — убрать). */
    setPathPlaque(i: number | null, lift: number, parts: PlaquePart[], gap = lift): void {
        this.pathPlaque.set(this.m, i === null ? null : this.map.cells[i]!, lift, parts, gap);
    }

    /**
     * Интро уровня (проба, board/intro.ts): `k` от 0 до 1 ведёт земля колоннами, падение фигур, линии и подсветку; `null` или 1 — всё на
     * месте (и волна подсветки стартует заново, когда интро закончилось).
     */
    setIntro(k: number | null): void {
        if (!this.parts) return;
        const done = k === null || k >= 1;
        if (done && !this.introOn) return;
        applyIntro({ m: this.m, ...this.parts, marks: this.marks.mesh, pieces: this.pieces(), appear: [this.mat.edge.uniforms.uAppear!, this.mat.riser.uniforms.uAppear!] }, done ? 1 : k);
        if (done) this.marks.restart(this.time);
        this.introOn = !done;
    }

    /** Центральная линия ленты атаки в мире (null — ленты нет). */
    get attackPath(): THREE.Vector3[] | null {
        return this.attack.path;
    }

    /** Размер кадра в пикселях буфера (для затухания линий к краям) и пикселей буфера в пикселе экрана (для толщины линий). */
    setResolution(w: number, h: number, px = 1): void {
        this.look.setResolution(w, h, px);
    }

    //---]> кадр, выбор мышью, освобождение

    /** Кадр: время для развёртки, мерцания, волны проявления, курсора и шевронов атаки. */
    update(dt: number): void {
        this.time += dt;
        this.mat.grid.uniforms.uTime!.value = this.time;
        this.marks.update(this.time);
        this.cursor.update(this.time);
        this.attack.update(this.time);
        this.attack.follow(this.view.yaw, this.view.pitch);
        this.pathPlaque.follow(this.view.yaw, this.view.pitch);
        this.shadows.update(this.m, this.pieces());
    }

    /** Угол и наклон камеры сейчас: от них шкалы HP юнитов остаются под моделью и в виде сверху. */
    get viewAngles(): { yaw: number; pitch: number; zoom: number } {
        return this.view;
    }

    /** Поворот и наклон камеры: плашки у целей остаются над ними и в виде сверху (сдвиг по земле вместо высоты). */
    setView(yaw: number, pitch: number, zoom = this.view.zoom): void {
        this.view = { yaw, pitch, zoom };
    }

    /**
     * Клетка под точкой экрана (нормализованные координаты −1..1) или null. Встроенный поиск Three не знает, где вершины склонов
     * (их ставит шейдер), поэтому проверяем сами: два треугольника верха каждой клетки (по той же диагонали сгиба) и её столбик;
     * ближайшее попадание и есть клетка.
     */
    pick(ndc: THREE.Vector2, camera: THREE.Camera): number | null {
        return this.pickHit(ndc, camera)?.i ?? null;
    }

    /**
     * Фигуры на поле — откуда их брать (спрашивается каждый кадр: юниты ходят). Под каждой тень, а её клетка для выбора — столбик
     * на уровень выше (`PICK_RAISE`): по корпусу меха попадаешь в его клетку, а не в клетку за ним, и всё ещё можно выбрать клетку
     * за высокой моделью (высота столбика не зависит от роста фигуры).
     */
    setPieces(source: () => Piece[]): void {
        this.pieces = source;
    }

    /** Как pick, но ещё и точка попадания в мире (редактору: у края клетки щёлкнули или у угла). */
    pickHit(ndc: THREE.Vector2, camera: THREE.Camera): { i: number; point: THREE.Vector3 } | null {
        this.ray.setFromCamera(ndc, camera);
        const ray = this.ray.ray;
        const hit = new THREE.Vector3();
        const box = new THREE.Box3();
        let best: { i: number; point: THREE.Vector3 } | null = null;
        let bestD = Infinity;
        const consider = (i: number, v: THREE.Vector3 | null): void => {
            if (!v) return;
            const d = v.distanceTo(ray.origin);
            if (d < bestD) {
                bestD = d;
                best = { i, point: v };
            }
        };
        const occupied = new Set(this.pieces().map((p) => this.map.index(p.cell.x, p.cell.z)));
        this.map.cells.forEach((c, i) => {
            const p00 = this.m.cornerPoint(c, 0, 0);
            const p10 = this.m.cornerPoint(c, 1, 0);
            const p11 = this.m.cornerPoint(c, 1, 1);
            const p01 = this.m.cornerPoint(c, 0, 1);
            const tris = foldDiagonal(c) === 'b' ? [[p00, p01, p10], [p10, p01, p11]] : [[p00, p01, p11], [p00, p11, p10]];
            for (const [a, b, t] of tris) consider(i, ray.intersectTriangle(a!, b!, t!, false, hit) && hit.clone());
            const { x, z } = this.m.center(c);
            box.min.set(x - 0.5, 0, z - 0.5);
            box.max.set(x + 0.5, this.m.topY(c) + (occupied.has(i) ? PICK_RAISE : 0), z + 0.5);
            consider(i, ray.intersectBox(box, hit) && hit.clone());
        });
        return best;
    }

    /** Клетка (x, z) под точкой экрана на уровне земли, даже вне карты (редактору: куда расширять поле). */
    groundCell(ndc: THREE.Vector2, camera: THREE.Camera): { x: number; z: number } | null {
        this.ray.setFromCamera(ndc, camera);
        const p = this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.m.topY({ x: 0, z: 0, h: 0, terrain: 'plain' })), new THREE.Vector3());
        return p ? { x: Math.floor(p.x + this.map.w / 2), z: Math.floor(p.z + this.map.d / 2) } : null;
    }

    /** Освободить всё, что поле держит в видеокарте (геометрии, материалы, текстуры). */
    dispose(): void {
        this.root.removeFromParent();
        this.disposeTerrain();
        this.marks.mesh.geometry.dispose();
        this.cursor.dispose();
        this.attack.dispose();
        this.pathPlaque.clear();
        this.hint.dispose();
        this.shadows.dispose();
        for (const mat of [...Object.values(this.mat), this.marks.material]) {
            for (const u of Object.values(mat.uniforms)) if (u.value instanceof THREE.Texture) u.value.dispose();
            mat.dispose();
        }
    }
}
