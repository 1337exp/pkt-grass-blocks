export { DEFAULT_MATERIALS, type MaterialDef } from './materials';
export { type Corners, type Dir, foldDiagonal, rampCorners, stepRise, type Surface } from './slope';
export { bounds, columnKey, createReadyWorld, createWorld, occupied, type Prop, type Sky, type Span, spansAt, type World, WorldError } from './world';
export { eraseBlock, fillBlock, fillRect, paintSpan, putProp, removePropAt, setCorners, setName, setSky, shiftTop } from './ops';
export { formatWorld, parseWorld, WORLD_VERSION } from './document';
export { type Cap, floors, floats, type Link, links, surfaces, walkCaps } from './walk';
export { islandWorld } from './island';
