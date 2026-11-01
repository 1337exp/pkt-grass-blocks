// Шейдеры блока. Всё рисуется процедурно, без текстур: так сразу видна форма, а не картинка.
// Узор считается по локальным координатам блока, поэтому не плывёт при вращении камеры.

const common = /* glsl */ `
varying vec3 vP;
varying vec3 vN;

uniform float uTop;

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

/** Как далеко от верхней кромки свисает трава в этой точке. Зависит только от (x, z), поэтому шов на углах непрерывен. */
float dripLen(vec2 xz) {
    float n = vnoise(xz * 7.0);
    return 0.17 + 0.36 * n * n + 0.08 * vnoise(xz * 27.0);
}

/** Координата вдоль стенки: на любой грани растёт слева направо. */
float along(vec3 p, vec3 n) {
    return dot(p.xz, vec2(-n.z, n.x));
}

const vec3 LIGHT = normalize(vec3(0.5, 0.8, 0.35));

float shade(vec3 n) {
    return 0.58 + 0.42 * clamp(dot(n, LIGHT), 0.0, 1.0);
}
`;

export const vertex = /* glsl */ `
varying vec3 vP;
varying vec3 vN;

void main() {
    vP = position;
    vN = normal;
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
    float d = uTop - vP.y;
    float len = dripLen(vP.xz);
    if (d > len) discard;

    float wall = 1.0 - smoothstep(0.35, 0.85, n.y);

    // Верх: нарисованная плитка, оттенок слегка плывёт по пятнам, чтобы повтор не бросался в глаза.
    vec3 top = texture2D(uTopMap, vP.xz * 0.8).rgb;
    top *= 0.9 + 0.2 * vnoise(vP.xz * 3.0);

    // Стенка: нарисованные свисающие пряди, у низа чуть темнее.
    float h = along(vP, n);
    vec3 side = texture2D(uSideMap, vec2(h * 0.8, 1.0 - d * 0.9)).rgb;
    side = mix(side, uDeep, smoothstep(0.0, len, d) * 0.3);

    vec3 col = mix(top, side, wall);

    // Тёмная кайма по рваному краю: она даёт пряди толщину.
    col = mix(col, uRim, smoothstep(len - 0.045, len, d) * wall);

    col *= shade(n);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
}
`;

/** Каменное тело: плиты рядами со смещением, тень под травяным навесом и тёмные корни из-под травы. */
export const stone = /* glsl */ `
${common}

uniform sampler2D uStoneMap;
uniform vec3 uRoot;

void main() {
    vec3 n = normalize(vN);
    float d = uTop - vP.y;
    float len = dripLen(vP.xz);
    float h = along(vP, n);

    // Камень: нарисованная плитка стенки, на верхней грани (её закрывает трава) берём ту же по xz.
    vec2 wallUv = vec2(h * 0.8, vP.y * 0.8);
    vec3 col = texture2D(uStoneMap, mix(wallUv, vP.xz * 0.8, step(0.7, n.y))).rgb;

    // Корни: тонкие кривые линии, которые выходят из-под травы вниз.
    float cell = h * 16.0;
    float rid = hash21(vec2(floor(cell), n.x * 5.0 + n.z * 9.0));
    float cx = fract(cell) - 0.5 + 0.18 * sin(d * 18.0 + rid * 6.0);
    float line = 1.0 - smoothstep(0.03, 0.07, abs(cx));
    float reach = len + 0.06 + rid * 0.22;
    float root = step(0.62, rid) * line * step(len, d) * (1.0 - smoothstep(len + 0.04, reach, d));
    col = mix(col, uRoot, root * 0.9);

    // Тень под навесом травы и у основания.
    col *= mix(0.62, 1.0, smoothstep(len, len + 0.14, d));
    col *= mix(0.7, 1.0, smoothstep(0.0, 0.35, vP.y));

    col *= shade(n);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
}
`;
