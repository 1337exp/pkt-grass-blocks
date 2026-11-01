// Модель юнита: болванчик-«ванзер» или вертолёт из коробок, размеры и тени, рамка высоты у летающих и окраска «серебряной статуи» для
// отходившего. Только сборка и материалы: поведение (выбор, шкала HP, ход) живёт в units.ts, unitBar.ts и unitMarker.ts.

import * as THREE from 'three';
import type { Team } from '../core/entity';
import { TEAM_COLOR } from './colors';
import { fadeToGround } from './groundFade';
import { patinaTexture } from './patina';

/** Корпус тёмный и одинаковый у всех, команду показывают светящиеся акценты (их подхватывает блум): свои оранжевые, чужие зелёные. */
const BODY = 0x2a3442;
const LIMB = 0x18202b;
/** Свечение акцентов: цвет команды, выровненный по яркости (colors.ts). */
export const TEAM_GLOW = TEAM_COLOR;

/**
 * Масштаб фигуры юнита на сцене. 0,55: рост меха 0,44, то есть чуть больше одного уровня земли (`LEVEL_H` = 0,4), как во FM3, где
 * платформа на уровень парит на высоту меха (подогнано по записям игры). Было 1,2 (мех в 2,4 уровня высотой). Тени ниже заданы для 1,2 и пересчитываются по масштабу.
 */
export const UNIT_SCALE = 0.55;
const SHADOW_REF_SCALE = 1.2;
const k = UNIT_SCALE / SHADOW_REF_SCALE;
/** Мягкая тень юнитов вдвое крупнее расчётной: лучше сажает фигуру на землю. Контактная (основание) не растёт: она по ногам, крупнее артефачит. */
const SHADOW_SCALE = 2;

/** Тень меха: полуоси пятна в долях клетки (board/shadows.ts) и основание — ноги (контактная тень). */
export const UNIT_SHADOW: [number, number] = [0.46 * k * SHADOW_SCALE, 0.42 * k * SHADOW_SCALE];
export const UNIT_CONTACT = { size: [0.26 * k, 0.15 * k] as [number, number] };
/** Тень вертолёта: пятно поменьше и без контактной (он висит, а не стоит: основание почти нулевое). */
export const HELI_SHADOW: [number, number] = [0.36 * k * SHADOW_SCALE, 0.3 * k * SHADOW_SCALE];
export const HELI_CONTACT = { size: [0.001, 0.001] as [number, number] };

/** Мехи (свои и чужие) крупнее расчётных на 15%: лучше читаются на карте. Растёт модель, тени и высота над макушкой. Вертолёт прежний. */
export const MECH_GROW = 1.15;

/** Рост робота (до верха головы) в единицах фигуры (до масштаба `UNIT_SCALE`). */
export const UNIT_HEIGHT = 0.8;
/** Верх вертолёта (кончик винта) в единицах фигуры, считая от его низа. */
export const HELI_TOP = 0.58;

/** Рамка высоты у летающих: линии и заливка пурпурные (цвет траекторий, не команды), непрозрачность 0,4. */
const FRAME_OPACITY = 0.4;
/** Оборотов винта в секунду. */
export const ROTOR_SPEED = 2.2;
/** Лёгкое холодное самосвечение отходившего юнита: корпус отдаёт серебром. */
const SILVER_GLOW = 0x161c22;

/** Порядок отрисовки (непрозрачные идут по возрастанию): сначала земля (0), затем силуэт сквозь землю, затем сама фигура. */
const XRAY_ORDER = 1;
const BODY_ORDER = 2;
/** Яркость силуэта относительно цвета команды: ниже порога блума сцены, не светится. */
const XRAY_DIM = 0.55;

/** Материал одной коробки с исходным цветом и свечением (чтобы перекрашивать и возвращать). */
export interface Paint {
    mat: THREE.MeshLambertMaterial;
    base: number;
    glow: number;
}

export interface Model {
    /** Тело фигуры в своей группе: вертолёт висит выше клетки, а шкала, пирамидка и тень остаются привязаны к клетке. */
    body: THREE.Group;
    paints: Paint[];
    /** Винт вертолёта (крутится в кадре); у меха нет. */
    rotor: THREE.Object3D | null;
}

/** Собрать модель: вертолёт (`air`, нос в +z) или мех, свечение акцентов по команде. */
export function buildModel(air: boolean, team: Team): Model {
    const body = new THREE.Group();
    const paints: Paint[] = [];
    let rotor: THREE.Object3D | null = null;
    /** Коробка; `glow` это свечение (0: без него). Тёмный низ («врастание» в землю) только у тех, кто стоит на земле. */
    const box = (w: number, h: number, d: number, color: number, x: number, y: number, z: number, glow = 0, parent: THREE.Object3D = body): void => {
        const mat = new THREE.MeshLambertMaterial({ color, emissive: glow, vertexColors: !air });
        paints.push({ mat, base: color, glow });
        const geo = new THREE.BoxGeometry(w, h, d);
        if (!air) fadeToGround(geo, y, UNIT_HEIGHT);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y, z);
        mesh.renderOrder = BODY_ORDER; // после силуэта (XRAY_ORDER): он проверяется по земле, а не по самой фигуре
        parent.add(mesh);
    };
    const glow = TEAM_GLOW[team];
    if (air) {
        // вертолёт: фюзеляж, остекление-визор, хвостовая балка с оперением, полозья, мачта и винт
        box(0.36, 0.28, 0.62, BODY, 0, 0.3, 0);
        box(0.3, 0.1, 0.16, 0x000000, 0, 0.36, 0.3, glow); // остекление: свечение команды
        box(0.1, 0.1, 0.5, LIMB, 0, 0.34, -0.5); // хвостовая балка
        box(0.04, 0.2, 0.1, LIMB, 0, 0.44, -0.74); // киль
        box(0.2, 0.04, 0.1, LIMB, 0, 0.36, -0.7); // стабилизатор
        box(0.04, 0.04, 0.5, LIMB, -0.16, 0.08, 0); // полозья
        box(0.04, 0.04, 0.5, LIMB, 0.16, 0.08, 0);
        box(0.03, 0.12, 0.03, LIMB, -0.16, 0.14, 0.12);
        box(0.03, 0.12, 0.03, LIMB, 0.16, 0.14, 0.12);
        box(0.03, 0.1, 0.03, LIMB, 0, 0.5, 0); // мачта винта
        const blades = new THREE.Group();
        blades.position.y = 0.56;
        box(1.0, 0.02, 0.07, LIMB, 0, 0, 0, 0, blades);
        box(0.07, 0.02, 1.0, LIMB, 0, 0, 0, 0, blades);
        body.add(blades);
        rotor = blades;
        box(0.5, 0.04, 0.4, 0x000000, 0, 0.3, 0, glow); // светящийся пояс по фюзеляжу
    } else {
        box(0.16, 0.34, 0.2, LIMB, -0.14, 0.17, 0); // ноги
        box(0.16, 0.34, 0.2, LIMB, 0.14, 0.17, 0);
        box(0.5, 0.32, 0.38, BODY, 0, 0.5, 0); // корпус
        box(0.52, 0.04, 0.4, 0x000000, 0, 0.6, 0, glow); // светящийся пояс по корпусу
        box(0.2, 0.14, 0.2, LIMB, 0, 0.73, 0.02); // голова
        box(0.16, 0.05, 0.06, 0x000000, 0, 0.74, 0.13, glow); // визор: смотрит вперёд (+z)
        box(0.12, 0.28, 0.14, BODY, -0.33, 0.48, 0); // руки
        box(0.12, 0.28, 0.14, BODY, 0.33, 0.48, 0);
        box(0.08, 0.08, 0.36, LIMB, 0.33, 0.45, 0.16); // орудие
    }
    return { body, paints, rotor };
}

/**
 * Силуэт «сквозь землю» для выбранного юнита (камера смотрит сквозь препятствия): копия модели плоским цветом команды, которая рисуется
 * только там, где фигуру закрывает что-то ближнее (`GreaterDepth`). Идёт после земли и до самой фигуры, поэтому сама фигура и её же
 * части друг друга не закрывают: сквозь торс не проступают дальние руки. Винт вертолёта в копии не крутится.
 */
export function buildXray(body: THREE.Group, glow: number): THREE.Group {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(glow).multiplyScalar(XRAY_DIM), depthFunc: THREE.GreaterDepth, depthWrite: false });
    const xray = body.clone(true);
    xray.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.material = mat;
        mesh.renderOrder = XRAY_ORDER;
    });
    return xray;
}

/** Отходивший юнит каменеет: серебристый, как статуя, без свечения команды (`on`); `false` возвращает краску. */
export function silver(paints: Paint[], on: boolean): void {
    const hsl = { h: 0, s: 0, l: 0 };
    for (const { mat, base, glow } of paints) {
        mat.color.setHex(base);
        if (on) {
            mat.color.getHSL(hsl);
            // серебро: светлее и с лёгким холодным оттенком, а не мёртвый серый
            mat.color.setHSL(0.58, 0.1, Math.min(0.72, hsl.l * 1.2 + 0.3));
        }
        mat.emissive.setHex(on ? SILVER_GLOW : glow);
        mat.map = on ? patinaTexture() : null; // патина серебра: пятнистый налёт, а не ровная краска
        mat.needsUpdate = true;
    }
}

/**
 * Рамка высоты (FM3 показывает летающего «стоящим» на невидимых блоках): четыре угла клетки столбами вверх и квадрат с заливкой
 * на высоте брюха. Показывает, над какой клеткой он парит и что прицел идёт от «невидимых блоков» под ним. Нормированная: по высоте
 * её растягивает масштаб группы.
 */
export function buildFrame(color: number): THREE.Group {
    const half = 0.49 / UNIT_SCALE; // чуть внутри клетки: не спорит с краем клетки и курсором
    const square = (y: number): number[] => [-half, y, -half, half, y, -half, half, y, -half, half, y, half, half, y, half, -half, y, half, -half, y, half, -half, y, -half];
    const posts = [-half, half].flatMap((x) => [-half, half].flatMap((z) => [x, 0.02, z, x, 1, z]));
    // порядок 1,5: после тени (0,5) и подсветки хода (1), но до курсора (2) и ленты атаки (3). Глубину пишет: курсор и лента
    // сверху честно скрываются там, где рамка ближе к камере, и видны там, где дальше
    const ordered = <T extends THREE.Object3D>(o: T): T => {
        o.raycast = () => {};
        o.renderOrder = 1.5;
        return o;
    };
    const lines = (pts: number[]): THREE.LineSegments => {
        const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        return ordered(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: FRAME_OPACITY, depthWrite: true })));
    };
    const fill = ordered(new THREE.Mesh(new THREE.PlaneGeometry(half * 2, half * 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: FRAME_OPACITY, depthWrite: true, side: THREE.DoubleSide })));
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = 1;
    const frame = new THREE.Group();
    frame.add(lines(posts), lines(square(1)), fill);
    return frame;
}
