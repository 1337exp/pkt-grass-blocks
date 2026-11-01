// Шейдер верха клеток: сетка (точки и крестики, затухание к краям), зерно, развёртка, местность (вода с изолиниями, течением и
// тенью берега, бурелом, дорога, стена). Принятый стиль (STYLE.md); пробные варианты — в archive/2026-10-view-variants.

import { cellQuadGlsl, edgeFadeGlsl, lineGlsl } from './common';

export const gridVert = /* glsl */ `
attribute vec3 aTint;
/** Упаковано в один атрибут (слотов у вершины немного): тип местности, уровень, берега (биты), диагональ сгиба. */
attribute vec4 aInfo;
attribute vec2 aFlow;
varying vec2 vUv;
varying vec3 vTint;
varying float vKind;
varying float vH;
varying vec3 vWorld;
varying vec2 vFlow;
varying float vShore;
${cellQuadGlsl}
void main() {
    vUv = cellUv(aInfo.w);
    vTint = aTint;
    vKind = aInfo.x;
    vH = aInfo.y;
    vFlow = aFlow;
    vShore = aInfo.z;
    vec4 w = modelMatrix * instanceMatrix * vec4(cellLocal(vUv), 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
}`;

export const gridFrag = /* glsl */ `
uniform float uTime;
uniform vec3 uLine;
uniform vec3 uGridColor;
uniform sampler2D uNoise;
varying vec2 vUv;
varying vec3 vTint;
varying float vKind;
varying float vH;
varying vec3 vWorld;
varying vec2 vFlow;
varying float vShore;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// плавный шум (значения в узлах решётки, между ними гладко)
float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// тонкая линия там, где величина k проходит через целое: толщина ~1 px при любом масштабе
float levelLine(float k) {
    float d = min(fract(k), 1.0 - fract(k));
    return 1.0 - smoothstep(0.5, 1.5, d / max(fwidth(k), 1e-4));
}
${edgeFadeGlsl}
${lineGlsl}
// мерцание воды в центре клетки c: 0..1 по синусоиде, соседи в противофазе
float waterPulse(vec2 c) {
    float phase = mod(c.x + c.y, 2.0) * 3.14159 + hash(c) * 1.2 + dot(c, vec2(0.45, 0.3));
    return 0.5 + 0.5 * sin(uTime * 1.6 + phase);
}
// узор линии по длине: крестик у узла и точки между узлами. t это координата вдоль линии, a расстояние вдоль неё до
// ближайшего угла. На краю уступа у узла остаётся луч внутрь площадки — «Т» (вдоль края узлы читаются делениями)
float pattern(float t, float a) {
    // крестик у узла: длина луча закреплена в долях клетки, край сглаживается внутрь (раньше наружу: вдали крест удлинялся)
    float plus = (1.0 - smoothstep(max(0.0, 0.13 - fwidth(a) * 1.5), 0.13, a)) * 1.35;
    // точки между узлами: восемь на ребро, тусклее крестиков; вдали сливаются в ровную тусклую линию, а не мерцают
    float g = abs(fract((t + 0.5) * 8.0) - 0.5);
    float w = fwidth(t) * 8.0;
    float dots = (1.0 - smoothstep(0.1 - w, 0.1 + w, g)) * 0.5;
    return max(plus, dots);
}
void main() {
    // линия по краю клетки той же толщины, что края уступов и вертикали (lineCover): расстояние до края в пикселях буфера.
    // Каждая клетка рисует свою половину линии, соседняя — вторую, вместе ровно uLineW
    vec2 e = min(vUv, 1.0 - vUv);
    vec2 fw = max(fwidth(vUv), vec2(1e-5));
    vec2 l = vec2(lineCover(e.x / fw.x), lineCover(e.y / fw.y));
    // у пересечений линии ярче, к середине ребра тише: структура сетки читается, а лишних линий в глазах меньше
    vec2 along = min(vUv, 1.0 - vUv); // расстояние до угла вдоль каждой из линий
    float lx = l.x * mix(0.55, 1.0, exp(-along.y * 9.0)) * pattern(vWorld.z, along.y);
    float ly = l.y * mix(0.55, 1.0, exp(-along.x * 9.0)) * pattern(vWorld.x, along.x);
    float line = max(lx, ly) * edgeFade();
    // зерно поверхности: тёмный шум в мировых координатах (без шва на стыках клеток), растянутый по контрасту
    float grain = (texture2D(uNoise, vWorld.xz * 0.13).r * 255.0 - 24.0) * 0.5;
    vec3 col = vTint * (1.0 + vH * 0.12) * (0.82 + 0.36 * grain);
    float lineA = 0.32;
    bool shallow = vKind > 2.5 && vKind < 3.5;
    if (vKind > 4.5) {
        // стена: глухой блок. Сетки сверху нет (на него не встать), только редкая диагональная штриховка
        lineA = 0.0;
        float hatch = levelLine((vWorld.x - vWorld.z) * 3.0);
        col = col * 0.9 + uGridColor * hatch * 0.05;
    } else if (vKind > 2.5) {
        // вода как в Ragnarok Online: участки по очереди светлеют и гаснут (соседи в противофазе, у каждого чуть своя фаза, поверх
        // медленная волна). Яркость считается в центрах клеток и плавно перетекает между ними: без резких границ тёмные клетки
        // читались как дыры. Контраст низкий: у воды своя база, мерцание лишь добавляет к ней
        // мелководье светлее и с сеткой поярче (по нему ходят), глубокая вода тише и темнее
        lineA = shallow ? 0.24 : 0.12;
        vec2 p = vWorld.xz - 0.5; // центры клеток в целых точках
        vec2 c0 = floor(p);
        vec2 f = p - c0;
        f = f * f * (3.0 - 2.0 * f);
        float w00 = waterPulse(c0);
        float w10 = waterPulse(c0 + vec2(1.0, 0.0));
        float w01 = waterPulse(c0 + vec2(0.0, 1.0));
        float w11 = waterPulse(c0 + vec2(1.0, 1.0));
        float shimmer = mix(mix(w00, w10, f.x), mix(w01, w11, f.x), f.y);
        // у русла свечение воды слабее: глубокое читается тёмным, мелкое светлым
        col += vec3(0.02, 0.055, 0.11) * (0.55 + 0.45 * shimmer) * (shallow ? 1.0 : 0.6);
        vec3 waterLine = vec3(0.12, 0.26, 0.42);
        // изолинии, как на экране эхолота: уровни медленно текущего шума
        vec2 w = vWorld.xz;
        float n = vnoise(w * 0.55 + vec2(uTime * 0.05, uTime * 0.03)) * 0.65 + vnoise(w * 1.25 - uTime * 0.04) * 0.35;
        col += waterLine * levelLine(n * 4.0) * (shallow ? 0.09 : 0.16);
        // течение: тонкие штрихи плывут вниз по реке, у каждой «дорожки» своя скорость и сдвиг, часть дорожек пустая
        vec2 dir = normalize(vFlow);
        vec2 perp = vec2(-dir.y, dir.x);
        float across = dot(vWorld.xz, perp) * 4.0;
        float lane = floor(across);
        float off = fract(across) - 0.5;
        float speed = 0.3 + 0.25 * hash(vec2(lane, 7.0));
        float ft = fract(dot(vWorld.xz, dir) * 0.9 - uTime * speed + hash(vec2(lane, 3.0)));
        float thin = 1.0 - smoothstep(0.04, 0.04 + fwidth(across) * 1.2, abs(off));
        float streak = smoothstep(0.0, 0.28, ft) * (1.0 - smoothstep(0.28, 0.31, ft)); // хвост тянется, голова впереди
        // штрихи только на части дорожек (около 24%, было 35%, потом 28%: разгружаем визуал): гуще рябит и отвлекает
        col += waterLine * thin * streak * step(0.762, hash(vec2(lane, 1.0))) * 0.1;
        // кромка берега: тень от суши. Вода у берега темнеет, будто берег нависает; свет не прибавляется, внимание не забирает.
        // У глубокой воды та же тень и у границы с мелководьем: обрыв в русло, туда пройдёт только ховер
        float sx = mod(vShore, 2.0);
        float snx = mod(floor(vShore / 2.0), 2.0);
        float snz = mod(floor(vShore / 4.0), 2.0);
        float spz = mod(floor(vShore / 8.0), 2.0);
        float d = 9.0;
        if (sx > 0.5) d = min(d, 1.0 - vUv.x);
        if (snx > 0.5) d = min(d, vUv.x);
        if (snz > 0.5) d = min(d, 1.0 - vUv.y);
        if (spz > 0.5) d = min(d, vUv.y);
        col *= 1.0 - exp(-d * 9.0) * 0.55;
    } else if (vKind > 1.5 && vKind < 2.5) {
        // бурелом: редкие точки по клетке, сразу видно «тут тяжело идти»
        vec2 g = fract(vUv * 5.0) - 0.5;
        float dots = step(length(g), 0.09) * step(0.35, hash(floor(vUv * 5.0) + vWorld.xz));
        col += uLine * dots * 0.12;
    } else if (vKind > 0.5 && vKind < 1.5) {
        // дорога: светлая полоса посередине
        col += vec3(0.02, 0.03, 0.035);
    }
    // полоса развёртки: медленно проходит по карте наискосок
    float scan = exp(-pow((fract((vWorld.x + vWorld.z) * 0.035 - uTime * 0.06) - 0.5) * 9.0, 2.0));
    // сетка серая, развёртка голубая
    col += uGridColor * line * lineA * (1.0 + scan * 1.2) + uLine * scan * 0.012;
    gl_FragColor = vec4(col, 1.0);
}`;
