// Шейдер курсора: рамка-индикатор на клетке под мышью (cellFrame), повторяет склон клетки.

import { cellFrameGlsl, cellQuadGlsl } from './common';

export const cursorVert = /* glsl */ `
attribute float aDiag;
varying vec2 vUv;
${cellQuadGlsl}
void main() {
    vUv = cellUv(aDiag);
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(cellLocal(vUv), 1.0);
}`;

export const cursorFrag = /* glsl */ `
uniform float uTime;
uniform float uPx;
uniform vec3 uColor;
varying vec2 vUv;
${cellFrameGlsl}
void main() {
    vec3 f = cellFrame(vUv, uTime, uPx);
    if (f.z <= 0.003) discard;
    gl_FragColor = vec4(uColor * f.x, f.z);
}`;
