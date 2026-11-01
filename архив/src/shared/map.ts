// То, чем карта пользуется снаружи: клетки, склоны и ход. Бой, оружие и фигуры сюда не входят.
// Пустая занятость — никто не стоит на клетках; игра подставляет своих, когда они появятся.

import { type Occupancy, type Pos, reachable, type Reach, type Mover, type GridMap, type ReachOptions } from './core/grid';

export {
    altitudeOf,
    cornerLevel,
    flies,
    foldDiagonal,
    GridMap,
    isWater,
    pathTo,
    rampCorners,
    reachable,
    stepCost,
    stepRise,
    TERRAIN,
} from './core/grid';
export type { Cell, Chassis, Corners, Dir, Mover, Occupancy, Pos, Reach, ReachOptions, Terrain } from './core/grid';

/** Никто не перекрывает клетки. Игра заменяет это своими фигурами. */
export const openGround: Occupancy = {
    blocks: () => false,
    occupied: () => false,
};

/** Куда можно дойти из клетки и какой путь туда ведёт. */
export function routes(map: GridMap, from: Pos, mover: Mover, occ: Occupancy = openGround, opts: ReachOptions = {}): Reach {
    return reachable(map, from, mover, occ, opts);
}
