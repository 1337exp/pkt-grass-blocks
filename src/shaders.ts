// Шейдеры карты. Узор считается по мировым координатам, поэтому не плывёт при вращении камеры и непрерывен через стыки клеток.

const noise = /* glsl */ `
float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
`;

/** Оттенок клетки: от жёлтого до тёмного, зависит от номера клетки, зерна и разброса. */
const tint = /* glsl */ `
uniform float uSeed;
uniform float uVariation;

vec3 cellTint(float cell) {
    float yellow = (fract(sin((cell * 3.0 + uSeed * 7.1) * 127.1) * 43758.5453) * 2.0 - 1.0) * uVariation;
    float bright = (fract(sin((cell * 5.0 + uSeed * 3.7 + 1.3) * 127.1) * 43758.5453) * 2.0 - 1.0) * uVariation;
    float k = 1.0 + 0.18 * bright;
    return vec3(k * (1.0 + 0.25 * yellow), k * (1.0 + 0.05 * yellow), k * (1.0 - 0.35 * yellow));
}
`;

const common = /* glsl */ `
varying vec3 vP;
varying vec3 vN;
varying float vTop;
varying vec3 vTint;
varying float vShade;

uniform float uDrip;
uniform float uShadow;
uniform float uFringeShadow;
${noise}

/** Как далеко от верхней кромки свисает трава в этой точке. Зависит только от (x, z), поэтому шов на углах непрерывен. */
float dripLen(vec2 xz) {
    float n = vnoise(xz * 7.0);
    return (0.17 + 0.36 * n * n + 0.08 * vnoise(xz * 27.0)) * uDrip;
}

/** Направление вдоль стенки в плоскости xz. Грань выбирается жёстко по главной оси нормали: на скруглённом ребре узор не размазывается, а меняется по линии. */
vec2 tangentOf(vec3 n) {
    vec2 s = abs(n.x) > abs(n.z) ? vec2(sign(n.x), 0.0) : vec2(0.0, sign(n.z));
    return vec2(-s.y, s.x);
}

/** Координата вдоль стенки: на любой грани растёт слева направо. */
float along(vec3 p, vec3 n) {
    return dot(p.xz, tangentOf(n));
}

const vec3 LIGHT = normalize(vec3(0.5, 0.8, 0.35));

float shade(vec3 n) {
    return 0.58 + 0.42 * clamp(dot(n, LIGHT), 0.0, 1.0);
}
`;

export const vertex = /* glsl */ `
attribute float aTop;
attribute float aCell;
attribute float aShade;

varying vec3 vP;
varying vec3 vN;
varying float vTop;
varying vec3 vTint;
varying float vShade;
${tint}

void main() {
    vP = position;
    vN = normal;
    vTop = aTop;
    vTint = cellTint(aCell);
    vShade = aShade;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** Оболочка травы: чуть шире камня, сверху шапка, по стенкам рваные пряди. Всё ниже пряди выбрасывается. */
export const grass = /* glsl */ `
${common}

uniform sampler2D uTopMap;
uniform sampler2D uSideMap;
uniform vec3 uDeep;
uniform vec3 uRim;

void main() {
    vec3 n = normalize(vN);
    float d = vTop - vP.y;
    float len = dripLen(vP.xz);
    if (d > len) discard;

    float wall = 1.0 - smoothstep(0.35, 0.85, n.y);

    // Верх: нарисованная плитка, оттенок слегка плывёт по пятнам, чтобы повтор не бросался в глаза.
    vec3 top = texture2D(uTopMap, vP.xz * 0.8).rgb;
    top *= 0.9 + 0.2 * vnoise(vP.xz * 3.0);

    // Стенка: нарисованные свисающие пряди, у низа чуть темнее.
    float h = along(vP, n);
    vec3 side = texture2D(uSideMap, vec2(h * 0.8, 1.0 - d * 0.9)).rgb;
    side = mix(side, uDeep, smoothstep(0.0, len, d) * (0.3 + 0.35 * uFringeShadow));

    vec3 col = mix(top, side, wall);

    // Тёмная кайма по рваному краю: она даёт пряди толщину.
    col = mix(col, uRim, smoothstep(len - 0.045, len, d) * wall);
    // Объём бахромы: ближе к рваному краю она густеет в тени, у верхней кромки остаётся светлой.
    col *= 1.0 - 0.5 * uFringeShadow * wall * smoothstep(len * 0.3, len, d);
    col *= vTint;
    // Тень от высокой соседней стенки на нижнем ярусе: плавно темнеет к подножию.
    col *= 1.0 - 0.45 * uShadow * vShade;

    col *= shade(n);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
}
`;

/** Каменное тело: плиты рядами со смещением, тень под травяным навесом и тёмные корни из-под травы. */
export const stone = /* glsl */ `
${common}

uniform sampler2D uStoneMap;
uniform float uStoneScale;
uniform vec3 uRoot;

void main() {
    vec3 n = normalize(vN);
    float d = vTop - vP.y;
    float len = dripLen(vP.xz);
    float h = along(vP, n);

    // Камень: нарисованная плитка стенки, на верхней грани (её закрывает трава) берём ту же по xz.
    vec2 wallUv = vec2(h, vP.y) * uStoneScale;
    vec3 col = texture2D(uStoneMap, mix(wallUv, vP.xz * uStoneScale, step(0.7, n.y))).rgb;

    // Корни: тонкие кривые линии, которые выходят из-под травы вниз.
    float cell = h * 16.0;
    float rid = hash21(vec2(floor(cell), n.x * 5.0 + n.z * 9.0));
    float cx = fract(cell) - 0.5 + 0.18 * sin(d * 18.0 + rid * 6.0);
    float line = 1.0 - smoothstep(0.03, 0.07, abs(cx));
    float reach = len + 0.06 + rid * 0.22;
    float root = step(0.62, rid) * line * step(len, d) * (1.0 - smoothstep(len + 0.04, reach, d));
    col = mix(col, uRoot, root * 0.9);

    // Тень под навесом травы и у основания.
    // Мягкая тень от бахромы на камне: усредняем по нескольким точкам вдоль стенки, поэтому она повторяет форму краёв, но размыта.
    vec2 t = tangentOf(n);
    float lit = 0.0;
    for (int k = -2; k <= 2; k++) {
        float l = dripLen(vP.xz + t * (float(k) * 0.05));
        lit += smoothstep(l * 0.6, l + 0.4, d);
    }
    col *= mix(1.0 - 0.6 * uShadow, 1.0, lit / 5.0);
    col *= mix(0.7, 1.0, smoothstep(0.0, 0.35, vP.y));

    col *= shade(n);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
}
`;

/** Травинка-карточка: стоит на верхней грани и всегда повёрнута к камере вокруг вертикали. */
export const tuftVertex = /* glsl */ `
attribute vec3 aOrigin;
attribute vec4 aShape;
attribute float aSeed;
attribute float aCell;
attribute float aShade;

uniform float uTime;
uniform float uWind;
${tint}

varying vec2 vUv;
varying vec3 vOrigin;
varying float vSeed;
varying vec3 vTint;
varying float vShade;

void main() {
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    right.y = 0.0;
    right = normalize(right);

    // aShape: ширина, высота, наклон по x, наклон по z. Наклон и ветер нарастают к кончику.
    float v = uv.y;
    float sway = sin(uTime * 1.7 + aOrigin.x * 4.0 + aOrigin.z * 3.0 + aSeed * 6.2832);
    float len = aShape.y;
    vec3 p = aOrigin + right * (position.x * aShape.x) + vec3(0.0, v * len, 0.0);
    p.x += (aShape.z + 0.22 * uWind * sway) * len * v * v;
    p.z += (aShape.w + 0.15 * uWind * sway) * len * v * v;

    vUv = uv;
    vOrigin = (modelMatrix * vec4(aOrigin, 1.0)).xyz;
    vSeed = aSeed;
    vTint = cellTint(aCell);
    vShade = aShade;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
}
`;

/** Форма рисуется прямо тут: острая изогнутая травинка. Цвет идёт градиентом основание, середина, кончик по пятнам шума. */
export const tuftFragment = /* glsl */ `
varying vec2 vUv;
varying vec3 vOrigin;
varying float vSeed;
varying vec3 vTint;
varying float vShade;

uniform float uShadow;
uniform vec3 uBase;
uniform vec3 uMid;
uniform vec3 uTip;
uniform vec3 uEdge;
${noise}

void main() {
    float v = vUv.y;
    float u = vUv.x - 0.5;
    float bend = (vSeed - 0.5) * 0.3 * v * v;
    float hw = 0.5 * pow(max(1.0 - v, 0.0), 0.7);
    float x = abs(u - bend);
    if (v > 0.995) discard;
    float a = 1.0 - smoothstep(hw - 0.04, hw, x);
    if (a < 0.5) discard;

    float spots = vnoise(vOrigin.xz * 5.0);
    float t = clamp(v * 0.75 + spots * 0.35 - 0.1 + (vSeed - 0.5) * 0.2, 0.0, 1.0);
    vec3 col = t < 0.5 ? mix(uBase, uMid, t * 2.0) : mix(uMid, uTip, (t - 0.5) * 2.0);
    col = mix(col, uEdge, smoothstep(hw * 0.7, hw, x) * 0.6);
    col *= vTint;
    col *= 1.0 - 0.45 * uShadow * vShade;

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
}
`;
