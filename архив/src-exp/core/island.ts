// Образец: два берега, вода в разрыве, деревянный настил над пустотой, утёс с пандусом и висячий островок.

import { fillRect, putProp, setCorners } from './ops';
import { rampCorners } from './slope';
import { createReadyWorld } from './world';

export function islandWorld() {
    let world = createReadyWorld('Острова');
    world = { ...world, sky: { hour: 10, cycleHours: 0 } };
    world = fillRect(world, 0, 0, 3, 4, 0, 3, 'grass');
    world = fillRect(world, 6, 0, 8, 4, 0, 3, 'grass');
    world = fillRect(world, 9, 0, 9, 4, 0, 4, 'rock');
    world = fillRect(world, 4, 0, 5, 0, 0, 1, 'water');
    world = fillRect(world, 4, 4, 5, 4, 0, 1, 'water');
    // Настил на высоте берегов, до пола не доходит: под ним воздух.
    world = fillRect(world, 4, 1, 5, 3, 2, 3, 'wood');
    world = setCorners(world, 8, 2, 0, rampCorners({ dx: 1, dz: 0 }));
    world = fillRect(world, 0, 6, 1, 7, 5, 7, 'grass');
    world = putProp(world, { id: 'tree-1', type: 'tree', x: 1, y: 3, z: 1, yaw: 0 });
    world = putProp(world, { id: 'crate-1', type: 'crate', x: 7, y: 3, z: 3, yaw: 1 });
    return world;
}
