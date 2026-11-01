// Шейдер линий-лент: края уступов и вертикали. Отрезок рисуется полосой, развёрнутой поперёк экрана, толщиной uLineW пикселей
// при любом масштабе и с тем же сглаживанием, что у сетки (lineGlsl): все линии поля одной толщины и одного вида. Вертикали
// ещё гаснут книзу (uFade), «парящие платформы».

import { edgeFadeGlsl, lineGlsl } from './common';

/**
 * Вершина ленты: `position` — свой конец отрезка, `aOther` — другой; aRib.x — сторона (−1 / 1), aRib.y — конец (0 начало,
 * 1 конец), aT — доля длины от верха (для затухания вертикалей). Полоса шире линии на пиксель с каждой стороны, под сглаживание,
 * и на полтолщины длиннее с концов, чтобы края в углах сходились без зазубрин.
 */
export const ribbonVert = /* glsl */ `
uniform vec2 uRes;
${lineGlsl}
attribute vec3 aOther;
attribute vec2 aRib;
attribute float aT;
varying float vAcross;
varying float vT;
void main() {
    vec4 p = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
    vec4 o = projectionMatrix * viewMatrix * modelMatrix * vec4(aOther, 1.0);
    vec2 toPx = uRes * 0.5;
    // направление от начала к концу в пикселях буфера (у вершины конца aOther — начало, поэтому знак)
    vec2 d = (o.xy / o.w - p.xy / p.w) * toPx * (aRib.y > 0.5 ? -1.0 : 1.0);
    d = length(d) > 1e-4 ? normalize(d) : vec2(1.0, 0.0);
    vec2 n = vec2(-d.y, d.x);
    float h = lineHalf() + uPx;
    vec2 shift = n * aRib.x * h + d * (aRib.y > 0.5 ? 1.0 : -1.0) * lineHalf();
    p.xy += shift / toPx * p.w;
    vAcross = aRib.x * h;
    vT = aT;
    gl_Position = p;
}`;

export const ribbonFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uFade;
/** Проявление линий целиком (интро уровня): 1 — полная яркость. */
uniform float uAppear;
varying float vAcross;
varying float vT;
${lineGlsl}
${edgeFadeGlsl}
void main() {
    float fade = mix(1.0, 1.0 - smoothstep(0.15, 0.7, vT), uFade);
    float a = lineCover(abs(vAcross)) * fade * uOpacity * edgeFade() * uAppear;
    if (a <= 0.003) discard;
    gl_FragColor = vec4(uColor, a);
}`;
