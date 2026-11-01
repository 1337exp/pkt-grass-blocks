// Общие куски шейдеров поля: квадрат клетки со склонами (вершинный) и затухание линий к краям экрана (фрагментный).

/** Насколько линия видна у этого пикселя: 1 в середине экрана, к краям мягко гаснет до 15% (внимание остаётся у центра). */
export const edgeFadeGlsl = /* glsl */ `
uniform vec2 uRes;
float edgeFade() {
    vec2 p = gl_FragCoord.xy / uRes * 2.0 - 1.0;
    return 1.0 - smoothstep(0.45, 1.15, length(p)) * 0.85;
}`;

/**
 * Одна формула толщины для всех линий поля (сетка, края уступов, вертикали): uLineW пикселей экрана при любом масштабе, край
 * сглажен на пиксель. `lineCover(d)` — насколько закрыт пиксель на расстоянии `d` пикселей буфера от оси линии.
 * uPx — пикселей буфера в пикселе экрана (плотность экрана), чтобы толщина не зависела от неё. Все линии поля — 1 px
 * (Look.lineW); толще только подсказка редактора.
 */
export const lineGlsl = /* glsl */ `
uniform float uPx;
uniform float uLineW;
float lineHalf() {
    return uLineW * uPx * 0.5;
}
float lineCover(float d) {
    float h = lineHalf();
    return 1.0 - smoothstep(h - 0.5 * uPx, h + 0.5 * uPx, d);
}`;

/**
 * Квадрат клетки из двух треугольников с углами на разной высоте (склоны). Геометрия — 6 вершин, у каждой два «слота»: какой
 * угол она означает при диагонали 'a' и при 'b'; диагональ (параметр cellUv) и подъёмы углов (в единицах мира, aCorners)
 * приходят атрибутами экземпляра.
 * Так один InstancedMesh рисует и ровные клетки, и пандусы, и угловые склоны, сложенные как в FM3. instanceMatrix только сдвигает
 * квадрат на нижний уровень клетки.
 */
export const cellQuadGlsl = /* glsl */ `
attribute vec2 aSlotA;
attribute vec2 aSlotB;
attribute vec4 aCorners;
vec2 cellUv(float diag) {
    return diag > 0.5 ? aSlotB : aSlotA;
}
// uv клетки: x вдоль мирового +x, y вдоль мирового −z (как у прежней плоскости); углы aCorners: (x−,z−), (x+,z−), (x+,z+), (x−,z+)
vec3 cellLocal(vec2 cu) {
    float iz = 1.0 - cu.y;
    float h = mix(mix(aCorners.x, aCorners.y, cu.x), mix(aCorners.w, aCorners.z, cu.x), iz);
    return vec3(cu.x - 0.5, h, 0.5 - cu.y);
}`;

/**
 * Рамка курсора внутри клетки — «потоки»: полоса от края клетки внутрь на `INSET` (не тонкая линия с отступом: ту часть рамки
 * закрывали детали фигуры на клетке, контейнер и т. п., — полоса до самого края всегда видна хотя бы снаружи фигуры). С внутренней
 * стороны и по краю клетки тёмные обводки (язык шва подсветки), по полосе по кругу бегут четыре огонька с хвостом. Возвращает (свет — множитель
 * цвета, затемнение под обводкой, закрытие — альфа для «over»).
 */
export const cellFrameGlsl = /* glsl */ `
vec3 cellFrame(vec2 uv, float time, float px) {
    vec2 q = abs(uv - 0.5);
    float r = max(q.x, q.y);
    float fwm = max(max(fwidth(uv).x, fwidth(uv).y), 1e-5);
    float inset = 0.08;
    // внутренняя кромка полосы: доля клетки плюс ещё 2 px экрана (полоса явнее при любом масштабе)
    float inner = 0.5 - inset - 2.0 * px * fwm;
    // полоса: от внутренней кромки до края клетки, кромка сглажена на пиксель
    float band = smoothstep(inner - 0.5 * px * fwm, inner + 0.5 * px * fwm, r);
    // тёмные обводки по 1 px с обеих сторон полосы: изнутри и по самому краю клетки (на светлой клетке без чёткой границы
    // полоса расплывается)
    float rimIn = (1.0 - smoothstep(1.0 * px, 2.0 * px, (inner - r) / fwm)) * (1.0 - band) * step(r, inner);
    float rimOut = 1.0 - smoothstep(1.0 * px, 2.0 * px, (0.5 - r) / fwm);
    band *= 1.0 - rimOut;
    float rim = max(rimIn, rimOut);
    // координата по периметру 0..4 против часовой (правая сторона, верх, левая, низ) по середине полосы, четыре огонька с
    // хвостом, каждый за 0,7 с проходит свою сторону; сама полоса тусклее (она шире линии), огонёк ярче
    vec2 u = uv - 0.5;
    float s = 0.5 - inset * 0.5;
    float t = abs(u.x) >= abs(u.y)
        ? (u.x > 0.0 ? (u.y + s) / (2.0 * s) : 2.0 + (s - u.y) / (2.0 * s))
        : (u.y > 0.0 ? 1.0 + (s - u.x) / (2.0 * s) : 3.0 + (u.x + s) / (2.0 * s));
    float ph = fract(t - time / 0.7);
    // хвост растянут (степень 4, было 6: огонёк длиннее на ~45%), свечение на 10% тише
    float flow = 0.22 + 0.99 * pow(ph, 4.0) * smoothstep(0.0, 0.04, 1.0 - ph);
    float gb = 0.9 + 0.1 * sin(time * 3.0);
    return vec3(band * flow * gb * 0.9, rim * 0.9, max(band * 0.85, rim * 0.9));
}`;
