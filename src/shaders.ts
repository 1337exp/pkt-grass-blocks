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
varying float vFacing;
varying float vCorner;

uniform float uDrip;
uniform float uRough;
uniform float uCoverage;
uniform float uFringeNoise;
uniform float uShadow;
uniform float uFringeShadow;
uniform float uDark;
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

/** Веса двух вертикальных осей стенки: x это стенка, смотрящая вдоль x, y это вдоль z. На скруглённом углу плавно перетекают, поэтому швов нет. */
vec2 wallWeights(vec3 n) {
    return vec2(pow(abs(n.x), 6.0), pow(abs(n.z), 6.0));
}

/** Шум в мировых координатах по трём осям с плавными весами: без швов на скруглённых углах. Возвращает пятна и мелкую крупу. */
vec2 triNoise(vec3 p, vec3 n, float sc) {
    vec3 w = vec3(pow(abs(n.x), 6.0), pow(abs(n.y), 6.0), pow(abs(n.z), 6.0));
    w /= max(w.x + w.y + w.z, 1e-4);
    vec2 a = vec2(p.z, p.y) * sc;
    vec2 b = vec2(p.x, p.z) * sc;
    vec2 c = vec2(p.x, p.y) * sc;
    float blots = w.x * (0.55 * vnoise(a * 6.0) + 0.45 * vnoise(a * 19.0))
        + w.y * (0.55 * vnoise(b * 6.0) + 0.45 * vnoise(b * 19.0))
        + w.z * (0.55 * vnoise(c * 6.0) + 0.45 * vnoise(c * 19.0));
    float grain = w.x * vnoise(a * 70.0) + w.y * vnoise(b * 70.0) + w.z * vnoise(c * 70.0);
    return vec2(blots, grain);
}

/** Координата вдоль стенки: на любой грани растёт слева направо. */
float along(vec3 p, vec3 n) {
    return dot(p.xz, tangentOf(n));
}

const vec3 LIGHT = normalize(vec3(0.5, 0.8, 0.35));

/** Затемнение стенок, повёрнутых от камеры: при вращении сцены они плавно темнеют. wall это доля стенки в пикселе (у верха ноль). */
float viewDark(float wall) {
    return mix(1.0, mix(1.0 - 0.65 * uDark, 1.0, smoothstep(0.05, 0.7, vFacing)), wall);
}

float shade(vec3 n) {
    return 0.58 + 0.42 * clamp(dot(n, LIGHT), 0.0, 1.0);
}
`;

export const vertex = /* glsl */ `
attribute float aTop;
attribute float aCell;
attribute float aShade;
attribute float aCorner;

varying vec3 vP;
varying vec3 vN;
varying float vTop;
varying vec3 vTint;
varying float vShade;
varying float vFacing;
varying float vCorner;
${tint}

void main() {
    vP = position;
    vN = normal;
    vTop = aTop;
    vTint = cellTint(aCell);
    vShade = aShade;
    vCorner = aCorner;
    // Насколько нормаль смотрит на камеру: у стенки, повёрнутой боком, стремится к нулю.
    vFacing = normalize(normalMatrix * normal).z;
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
    float h = along(vP, n);
    // Шершавый край: мелкий шум сдвигает границу, чтобы переход не был идеальным и пластиковым.
    float around = vP.x + vP.z;
    float jag = (vnoise(vec2(around * 38.0, d * 38.0)) * 0.65 + vnoise(vec2(around * 110.0, d * 110.0)) * 0.35 - 0.5) * 0.14 * uRough;
    float edgeLen = len + jag;
    if (d > edgeLen) discard;

    float wall = 1.0 - smoothstep(0.35, 0.85, n.y);

    // Верх: нарисованная плитка, оттенок слегка плывёт по пятнам, чтобы повтор не бросался в глаза.
    vec3 top = texture2D(uTopMap, vP.xz * 0.8).rgb;
    top *= 0.9 + 0.2 * vnoise(vP.xz * 3.0);

    // Стенка: нарисованные свисающие пряди, у низа чуть темнее.
    vec2 wxz = wallWeights(n);
    vec3 side = (wxz.x * texture2D(uSideMap, vec2(vP.z * 0.8, 1.0 - d * 0.9)).rgb + wxz.y * texture2D(uSideMap, vec2(vP.x * 0.8, 1.0 - d * 0.9)).rgb) / max(wxz.x + wxz.y, 1e-4);
    side = mix(side, uDeep, smoothstep(0.0, len, d) * (0.3 + 0.35 * uFringeShadow));

    vec3 col = mix(top, side, wall);

    // Шум на траве: пятна светлее и темнее со сдвигом к жёлтому и мелкая крупа, чтобы бахрома не была гладкой.
    vec2 gf = triNoise(vP, n, 1.2);
    float blot = (gf.x - 0.5) * uFringeNoise;
    col *= vec3(1.0 + 0.55 * blot, 1.0 + 0.4 * blot, 1.0 - 0.3 * blot);
    col *= 1.0 + (gf.y - 0.5) * 0.35 * uFringeNoise;

    // Тёмная кайма по рваному краю: она даёт пряди толщину.
    col = mix(col, uRim, smoothstep(edgeLen - 0.045, edgeLen, d) * wall);
    // Объём бахромы: ближе к рваному краю она густеет в тени, у верхней кромки остаётся светлой.
    col *= 1.0 - 0.5 * uFringeShadow * wall * smoothstep(len * 0.3, len, d);
    col *= vTint;
    // Тень от высокой соседней стенки на нижнем ярусе: плавно темнеет к подножию.
    col *= 1.0 - 0.45 * uShadow * vShade;

    col *= shade(n) * viewDark(wall);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
}
`;

/** Каменное тело: плиты рядами со смещением, тень под травяным навесом и тёмные корни из-под травы. */
export const stone = /* glsl */ `
${common}

uniform sampler2D uStoneMap;
uniform float uStoneScale;
uniform float uMaskCut;
uniform float uRelief;
uniform vec3 uMudDark;
uniform vec3 uMudLight;
uniform float uMudNoise;
uniform float uMudScale;
uniform float uCracks;
uniform float uVeins;
uniform float uPebbles;

/** Маска камней из яркости нарисованной текстуры: щели между плитами тёмные, плиты светлые. Края мягкие. */
float stoneMask(vec2 uv) {
    float l = pow(dot(texture2D(uStoneMap, uv).rgb, vec3(0.299, 0.587, 0.114)), 0.4545);
    return smoothstep(uMaskCut - 0.06, uMaskCut + 0.06, l);
}

/** Тонкие линии: 1 вдоль нулевых значений шума. */
float ridge(vec2 q) {
    return 1.0 - abs(vnoise(q) * 2.0 - 1.0);
}

/** Один камешек на клетку сетки: маска и освещённость (верх светлее). Число камешков задаёт ползунок. */
vec2 pebble(vec2 f) {
    vec2 id = floor(f);
    vec2 l = fract(f);
    float present = step(1.0 - 0.45 * uPebbles, hash21(id + 3.7));
    vec2 c = vec2(hash21(id + 1.3), hash21(id + 7.7)) * 0.4 + 0.3;
    float rad = 0.16 + 0.12 * hash21(id + 5.1);
    vec2 dv = l - c;
    float m = (1.0 - smoothstep(rad * 0.82, rad, length(dv))) * present;
    return vec2(m, clamp(0.5 + dv.y / rad * 0.5, 0.0, 1.0));
}

/** Трещины, прожилки и мелкие камешки по одной проекции. x это трещина, y прожилка, z маска камешка, w освещённость камешка. */
vec4 detailAt(vec2 q) {
    vec2 warp = vec2(vnoise(q * 5.0), vnoise(q * 5.0 + 9.0)) * 0.25;
    float crack = smoothstep(0.93, 0.985, ridge(q * 2.2 + warp));
    float vein = smoothstep(0.9, 0.975, ridge(q * 4.0 + warp + 3.0));
    vec2 p = pebble(q * 7.0);
    return vec4(crack, vein, p);
}

/** Оживление земли: тёмные трещины, светлые прожилки и мелкие камешки. В мировых координатах по трём осям, без швов на углах. */
vec3 mudDetail(vec3 p, vec3 n, vec3 mud) {
    vec3 w = vec3(pow(abs(n.x), 6.0), pow(abs(n.y), 6.0), pow(abs(n.z), 6.0));
    w /= max(w.x + w.y + w.z, 1e-4);
    vec4 d = w.x * detailAt(vec2(p.z, p.y)) + w.y * detailAt(vec2(p.x, p.z)) + w.z * detailAt(vec2(p.x, p.y));
    vec3 col = mud * (1.0 - 0.75 * uCracks * d.x);
    col = mix(col, col * 1.5 + 0.04, uVeins * d.y * 0.7);
    vec3 stoneCol = uMudLight * (0.8 + 0.7 * d.w);
    return mix(col, stoneCol * (1.0 - 0.25 * smoothstep(0.55, 0.0, d.z) * d.z), clamp(d.z * 1.6, 0.0, 1.0));
}

/** Мазки камня: низкочастотный шум решает, где камень лежит, а где остаётся голая земля. У углов стенки камня нет. */
float brushAt(vec2 uv) {
    float n = 0.6 * vnoise(uv * 4.0 + 13.0) + 0.4 * vnoise(uv * 11.0 + 5.0);
    float cut = mix(0.75, 0.3, uCoverage);
    return smoothstep(cut, cut + 0.1, n) * (1.0 - vCorner) * step(0.001, uCoverage);
}

float stoneAt(vec2 uv) {
    return stoneMask(uv) * brushAt(uv);
}

void main() {
    vec3 n = normalize(vN);
    float d = vTop - vP.y;
    float len = dripLen(vP.xz);
    float h = along(vP, n);

    // Камни лежат поверх мутной земли: маска из текстуры, на верхней грани (её закрывает трава) берём ту же по xz.
    vec2 wallUv = vec2(h, vP.y) * uStoneScale;
    vec2 uv = mix(wallUv, vP.xz * uStoneScale, step(0.7, n.y));
    vec3 tex = texture2D(uStoneMap, uv).rgb;
    float mask = stoneAt(uv);

    // Земля: пятна двух оттенков и мелкая крупа. Сила шума задаётся ползунком: на нуле земля гладкая и одного цвета.
    vec2 field = triNoise(vP, n, uStoneScale * uMudScale);
    vec3 mud = mix(mix(uMudDark, uMudLight, 0.5), mix(uMudDark, uMudLight, field.x), uMudNoise);
    mud *= 1.0 + (field.y - 0.5) * 0.45 * uMudNoise;
    mud = mudDetail(vP, n, mud);

    // Рельеф без карты нормалей: камень выше по стенке отбрасывает мягкую тень вниз, а верхняя кромка камня подсвечена.
    float covered = (stoneAt(uv + vec2(0.0, 0.007)) + stoneAt(uv + vec2(0.004, 0.015)) + stoneAt(uv + vec2(0.008, 0.026))) / 3.0;
    float shadow = covered * (1.0 - mask);
    float edge = mask * (1.0 - stoneAt(uv + vec2(0.0, 0.01)));

    vec3 col = mix(mud * (1.0 - 0.65 * uRelief * shadow), tex * (1.0 + 0.3 * uRelief * edge), mask);

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

    col *= shade(n) * viewDark(1.0 - smoothstep(0.35, 0.85, n.y));
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
