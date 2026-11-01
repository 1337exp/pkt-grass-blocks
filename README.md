# pkt-block-topo

<p align="center">
  <img src="docs/media/overview.png" alt="A hand-painted isometric block island: grass with blades, a fringe over soft soil" width="860">
</p>

**English** · [Русский](README.ru.md)

A prototype of a pretty isometric block map in Three.js. The question it answers: can a plain grid of blocks look hand-painted, like the 2D games it takes after, without drawing a tile for every case? Short answer: yes, with a few cheap tricks layered on top of a handful of painted textures.

Everything is procedural except three textures (grass top, grass side, stone). Nothing else is baked.

## Run

```bash
npm install
npm run dev
```

Open the address Vite prints. Drag to rotate, wheel to zoom. The panel at the top left holds every setting; fold it with the button.

```bash
npm run typecheck     # vue-tsc --noEmit
npm run test          # vitest (no tests for the prototype yet)
npm run screenshot    # docs/media/overview.png, needs Chrome or Edge
```

## How it looks the way it does

| Layer | What it does |
| --- | --- |
| **One shared mesh** | The map is a height grid. One surface is built from it with no inner faces, rounded only on exposed edges and with a bevel around inner corners, so block joints and wall seams do not exist. |
| **Grass shell** | A thin skin over the stone, a little wider and higher. Its top is a painted tile, its walls a painted curtain cut off by a noisy, ragged edge. |
| **Blades** | Hundreds of instanced camera-facing cards, their shape drawn in the shader. They stand on the top and lean outward along open edges, which is what gives the top its volume. |
| **Soil** | Procedural: two tones of blotches, grain, cracks, veins and small pebbles, all in world space with triplanar blending so rounded corners have no seams. |
| **Light, cheaply** | A soft shadow under the fringe that follows its shape, a shadow at the foot of tall walls, per-cell tint, and walls that darken as they turn away from the camera. |

Settings are plain sliders in [`src/controls.ts`](src/controls.ts): wind sway, grass seed, tint spread, blade density, soil noise and scale, cracks, veins, pebbles, stone scale, shadows, wall darkening, edge roughness, corner radius and fringe length.

## Layout

```
src/
  main.ts       scene, orthographic isometric camera, settings panel
  terrain.ts    puts stone, grass shell and blades together
  skin.ts       builds the mesh from the height grid
  tufts.ts      the instanced blades
  shaders.ts    all shaders
  controls.ts   shared settings
public/tex/     the three painted textures
docs/           notes on the texture workflow
scripts/        screenshot.mjs
архив/          old code, kept only as a source of ideas, not built
```

The map lives in `main.ts` as a small height grid, with an L-shaped second tier and a single pillar to show inner and outer corners.

## Textures

The painted textures are made through the Cursor agent, see [`docs/textures.md`](docs/textures.md) for the workflow and the pitfalls. Stone is optional: set "wall stone coverage" above zero to lay painted stones over the soil like brush strokes that avoid corners.

## Known limits

- Inner corners of walls are still sharp: the top is rounded around them, the vertical join is not.
- The demo uses a fixed light. A time-of-day light would need the camera-dependent wall darkening reconciled with it.
- It is a prototype: no editor, no saving, no tests of the mesh builder yet.
