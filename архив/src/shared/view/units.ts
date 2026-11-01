// Юниты: один класс собирает части (модель из коробок: unitModel.ts, шкала HP под ногами: unitBar.ts, пирамидка выбора: unitMarker.ts)
// и ведёт анимацию хода по клеткам: шаг за шагом, на перепаде высоты прыжок дугой.

import * as THREE from 'three';
import { altitudeOf, type Cell, flies, type Mover, type Pos, stepRise } from '../core/grid';
import { AP_START } from '../core/ap';
import { DEFAULT_ARM_BONUS } from '../core/hit';
import type { Team, UnitSpec } from '../core/entity';
import type { Board } from './board';
import { LEVEL_H } from './board/metrics';
import { ORANGE, TRAJECTORY_COLOR } from './colors';
import { buildFrame, buildModel, buildXray, HELI_CONTACT, HELI_SHADOW, HELI_TOP, MECH_GROW, type Paint, ROTOR_SPEED, silver, UNIT_CONTACT, UNIT_HEIGHT, UNIT_SCALE, UNIT_SHADOW, TEAM_GLOW } from './unitModel';
import { UnitBar } from './unitBar';
import { OVERHEAD_GAP, SelectMarker } from './unitMarker';

export type { Team, UnitSpec };
// размеры и тени, которые знают снаружи (поле, редактор)
export { HELI_CONTACT, HELI_SHADOW, TEAM_GLOW, UNIT_CONTACT, UNIT_HEIGHT, UNIT_SCALE, UNIT_SHADOW } from './unitModel';

/** Сколько секунд один шаг по ровному и добавка к прыжку за каждый уровень перепада. */
const STEP_SEC = 0.15;
const HOP_SEC_PER_LEVEL = 0.05;

export class Unit {
    readonly obj = new THREE.Group();
    /** Вид из каталога (catalog.ts): по нему правила знают, что за юнит. */
    readonly type: string;
    /** Бонус точности рук и уклонение ног (core/hit.ts): без них стандартные. */
    readonly arm: number;
    readonly evasion: number;
    /** Очки действия (core/ap.ts): предел, подзарядка в начале хода и текущий остаток. */
    readonly apMax: number;
    readonly apCharge: number;
    ap: number;
    readonly name: string;
    readonly team: Team;
    readonly mover: Mover;
    /** Оружие (core/weapons.ts). */
    readonly weapon: string;
    pos: Pos;
    hp: number;
    readonly maxHp: number;
    /** Уже ходил в этот ход. */
    moved = false;
    /** Тени под фигурой (board/shadows.ts): мягкая и контактная; у вертолёта своя, без основания. */
    readonly shadow: [number, number];
    readonly contact: { size: [number, number] };

    /** Высота, на которой висит фигура над клеткой, в единицах фигуры: у вертолёта `AIR_ALTITUDE` уровней (идёт за землёй под ним), у остальных 0. */
    private readonly lift: number;
    private readonly air: boolean;
    /** Во сколько раз модель крупнее расчётной (мехи `MECH_GROW`, вертолёт 1). */
    private readonly grow: number;
    private readonly body: THREE.Group;
    private readonly paints: Paint[];
    /** Винт вертолёта (крутится в update). */
    private readonly rotor: THREE.Object3D | null;
    /** Рамка высоты у летающих: углы клетки столбами вверх и залитый квадрат на высоте брюха (виден при наведении на клетку). */
    private readonly frame: THREE.Group | null = null;
    /** Силуэт сквозь землю у выбранного (unitModel.ts). */
    private readonly xray: THREE.Group;
    private readonly bar: UnitBar;
    private readonly marker = new SelectMarker();
    /** Оранжевая пирамидка над врагом в радиусе атаки выбранного героя (то же, что зелёная у выбранного, но цвет врагов). */
    private readonly aim = new SelectMarker(ORANGE, false);
    private walk: { path: Cell[]; t: number; seg: number; done: () => void } | null = null;
    /** Юнит встал на очередную клетку пути (для ряби на воде и прочих откликов). */
    onStep?: (c: Cell) => void;

    constructor(
        spec: UnitSpec,
        private readonly board: Board,
    ) {
        this.type = spec.type;
        this.arm = spec.arm ?? DEFAULT_ARM_BONUS;
        this.evasion = spec.evasion ?? 0;
        this.apMax = spec.apMax ?? AP_START;
        this.apCharge = spec.apCharge ?? AP_START;
        this.ap = this.apMax;
        this.name = spec.name;
        this.team = spec.team;
        this.mover = spec.mover;
        this.weapon = spec.weapon;
        this.pos = { ...spec.pos };
        this.hp = this.maxHp = spec.hp;

        const air = flies(spec.mover);
        this.air = air;
        this.lift = air ? (altitudeOf(spec.mover) * LEVEL_H) / UNIT_SCALE : 0;
        // мехи крупнее на 15%: модель, тени и высота над макушкой растут вместе
        this.grow = air ? 1 : MECH_GROW;
        const [sx, sz] = air ? HELI_SHADOW : UNIT_SHADOW;
        this.shadow = [sx * this.grow, sz * this.grow];
        const [cx, cz] = (air ? HELI_CONTACT : UNIT_CONTACT).size;
        this.contact = { size: [cx * this.grow, cz * this.grow] };

        const model = buildModel(air, spec.team);
        this.body = model.body;
        this.body.scale.setScalar(this.grow); // до силуэта: он копирует тело вместе с масштабом
        this.paints = model.paints;
        this.rotor = model.rotor;
        this.xray = buildXray(this.body, TEAM_GLOW[spec.team]);
        this.xray.visible = false;
        this.obj.add(this.body, this.xray, this.marker.mesh, this.aim.mesh);

        this.bar = new UnitBar(spec.team);
        this.obj.add(this.bar.tag);
        this.bar.render(this.hp, this.maxHp);

        this.obj.scale.setScalar(UNIT_SCALE);
        if (air) {
            this.frame = buildFrame(TRAJECTORY_COLOR);
            this.frame.visible = false;
            this.obj.add(this.frame);
        }
        this.layout();
        // враги смотрят на нас, свои от нас
        this.obj.rotation.y = spec.team === 'enemy' ? -Math.PI / 2 : Math.PI / 2;
        this.place();
    }

    /**
     * Высота над клеткой в мире, где парит центр пирамидки выбора над макушкой. Плашки у цели ставятся над целью так, чтобы их нижняя
     * граница была на этой же отметке: выше макушки, с зазором.
     */
    get markerY(): number {
        return this.marker.worldY;
    }

    /** Зазор между макушкой модели и отметкой плашек (unitMarker.ts): на него плашки сдвигаются по земле в виде сверху. */
    get overheadGap(): number {
        return OVERHEAD_GAP;
    }

    /** Убрать юнита со сцены и освободить его ресурсы (шкала — HTML-элемент, её убираем со страницы отдельно). */
    dispose(): void {
        this.obj.removeFromParent();
        this.obj.traverse((o) => {
            const m = o as THREE.Mesh;
            m.geometry?.dispose();
            (m.material as THREE.Material | undefined)?.dispose();
        });
        this.bar.dispose();
    }

    /** Встать в центр своей клетки. */
    place(): void {
        this.obj.position.copy(this.board.surface(this.cell()));
    }

    cell(): Cell {
        return this.board.map.at(this.pos.x, this.pos.z)!;
    }

    /** Враг в радиусе атаки: оранжевая пирамидка над головой. */
    setAimed(on: boolean): void {
        this.aim.setVisible(on);
    }

    /** Выбран ли: силуэт сквозь землю и (если `marker`) зелёная пирамидка. В фазе атаки пирамидку прячем: пустая клетка в центре радиуса и так отмечает героя. */
    setSelected(on: boolean, marker = true): void {
        this.marker.setVisible(on && marker);
        this.xray.visible = on;
    }

    /** Отходивший юнит каменеет: серебристый, как статуя, без свечения команды. Шкала HP не меняется: прозрачность на неё не вешаем. */
    setMoved(on: boolean): void {
        this.moved = on;
        silver(this.paints, on);
    }

    get walking(): boolean {
        return this.walk !== null;
    }

    /** Пройти по пути (первая клетка это текущая); `done` после последнего шага. */
    walkPath(path: Cell[], done: () => void): void {
        if (path.length < 2) {
            done();
            return;
        }
        this.walk = { path, t: 0, seg: 0, done };
    }

    /**
     * Разместить всё, что зависит от высоты полёта: тело, рамку (нормированная, масштаб по высоте), шкалу HP под низом и пирамидку над
     * макушкой. Шкала и пирамидка стоят в мире от модели, а не на фиксированной высоте; в единицах фигуры делим на масштаб: они дети фигуры.
     */
    private layout(): void {
        this.body.position.y = this.lift;
        this.xray.position.y = this.lift;
        if (this.frame) this.frame.scale.y = Math.max(this.lift, 1e-3);
        const top = (this.lift + (this.air ? HELI_TOP : UNIT_HEIGHT) * this.grow) * UNIT_SCALE;
        this.marker.layout(top);
        this.aim.layout(top);
        this.bar.layout(this.lift);
    }

    /** Прямоугольник шкалы HP на экране и скрытие её под лентой атаки (приоритет у ленты). */
    barRect(): DOMRect {
        return this.bar.rect();
    }

    setBarHidden(hide: boolean): void {
        this.bar.setHidden(hide);
    }

    /** Показать рамку высоты (только у летающих): когда курсор на клетке этого юнита. */
    showFrame(on: boolean): void {
        if (this.frame) this.frame.visible = on;
    }

    /** Кадр анимации, `dt` в секундах. */
    update(dt: number): void {
        // рамка не поворачивается вместе с фигурой: контур остаётся по клетке
        if (this.frame) this.frame.rotation.y = -this.obj.rotation.y;
        this.bar.follow(this.board.viewAngles, this.obj.rotation.y);
        if (this.rotor) this.rotor.rotation.y += dt * ROTOR_SPEED * Math.PI * 2;
        this.marker.update(dt);
        this.aim.update(dt);
        const w = this.walk;
        if (!w) return;
        let left = dt;
        while (left > 0 && this.walk) {
            const a = w.path[w.seg]!;
            const b = w.path[w.seg + 1]!;
            const air = flies(this.mover);
            const dh = air ? 0 : stepRise(a, b); // по пандусу перепада нет: идёт шагом, а не прыгает; вертолёт летит ровно
            const dur = STEP_SEC + Math.abs(dh) * HOP_SEC_PER_LEVEL;
            const use = Math.min(left, dur - w.t);
            w.t += use;
            left -= use;
            const u = w.t / dur;
            const pa = this.board.surface(a);
            const pb = this.board.surface(b);
            this.obj.position.lerpVectors(pa, pb, u);
            // перепад: прыжок дугой над верхним краем, по ровному лёгкое покачивание шага
            const arc = air ? 0 : dh !== 0 ? 0.18 + Math.abs(dh) * 0.12 : 0.03;
            const rise = air ? u : dh > 0 ? Math.sqrt(u) : u * u;
            this.obj.position.y = pa.y + (pb.y - pa.y) * rise + Math.sin(Math.PI * u) * arc;
            this.obj.rotation.y = Math.atan2(pb.x - pa.x, pb.z - pa.z);
            if (w.t >= dur - 1e-9) {
                w.t = 0;
                w.seg++;
                this.onStep?.(b);
                if (w.seg >= w.path.length - 1) {
                    const last = w.path[w.path.length - 1]!;
                    this.pos = { x: last.x, z: last.z };
                    this.place();
                    this.walk = null;
                    w.done();
                }
            }
        }
    }
}
