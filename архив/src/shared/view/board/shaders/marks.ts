// Шейдер подсветки клеток: рама из текстуры, узлы в углах, волна проявления, пульс пути.

import { cellQuadGlsl } from './common';

export const markVert = /* glsl */ `
attribute vec3 aColor;
attribute float aEdges;
attribute float aDist;
attribute float aPulse;
attribute vec3 aNode;
varying vec2 vUv;
varying vec3 vColor;
varying vec3 vNode;
varying float vEdges;
varying float vDist;
varying float vPulse;
attribute float aDiag;
uniform vec2 uCenter;
uniform float uHasCenter;
varying float vDistF;
${cellQuadGlsl}
void main() {
    vUv = cellUv(aDiag);
    vColor = aColor;
    vNode = aNode;
    vEdges = aEdges;
    vDist = aDist;
    vPulse = aPulse;
    vec4 w = modelMatrix * instanceMatrix * vec4(cellLocal(vUv), 1.0);
    // расстояние для волны проявления непрерывное по клетке: цена пути до клетки плюс отступ точки от центра клетки вдоль луча от юнита
    // (евклидово расстояние точки минус центра клетки). Тогда фронт идёт плавно внутри клетки, а не прыгает от клетки к клетке
    vec4 c = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vDistF = aDist + uHasCenter * (length(w.xz - uCenter) - length(c.xz - uCenter));
    gl_Position = projectionMatrix * viewMatrix * w;
}`;

/** Ширина мягкого края фронта проявления, в клетках пути. */
const FRONT_SOFT = '2.0';

export const markFrag = /* glsl */ `
const float FRONT_SOFT = ${FRONT_SOFT};
uniform float uTime;
uniform float uShown;
uniform sampler2D uFrame;
uniform float uPx;
/** Цвет маяков пути: серебро курсора. */
uniform vec3 uDotColor;
varying vec2 vUv;
varying vec3 vColor;
varying vec3 vNode;
varying float vEdges;
varying float vDist;
varying float vPulse;
varying float vDistF;
// узел в углу (q от угла): линии рамы расширяются и светлеют к нему, в середине маленькое светлое ядро другого оттенка.
// Каждая клетка рисует свою четверть, у общих углов четверти складываются в целый узел
float flare(vec2 q) {
    q = abs(q);
    return exp(-min(q.x, q.y) * 26.0) * exp(-max(q.x, q.y) * 9.0);
}
float core(vec2 q) {
    return exp(-length(q) * 40.0);
}
void main() {
    // проявление волной от юнита: клетка зажигается, когда до неё доходит фронт, и вспыхивает на нём (16 клеток пути в секунду)
    float front = uShown * 18.5 - vDistF;
    // край фронта мягкий: клетка проявляется плавно за FRONT_SOFT клеток пути, а не вспыхивает целиком
    float on = smoothstep(0.0, FRONT_SOFT, front);
    if (on <= 0.003) discard;
    float flash = exp(-pow(front - 0.6, 2.0) * 3.0) * 0.6;
    // какие стороны внешние (сосед не подсвечен): биты +x, -x, -z (uv.y = 1), +z (uv.y = 0)
    float ox = mod(vEdges, 2.0);
    float onx = mod(floor(vEdges / 2.0), 2.0);
    float onz = mod(floor(vEdges / 4.0), 2.0);
    float opz = mod(floor(vEdges / 8.0), 2.0);
    // путь светлячками: клетка пути не горит рамой (под ней и так рама радиуса, вдвоём они давали двойной свет), в центре —
    // круглый огонёк, лежащий на клетке (круги, а не квадраты: квадратов на поле и так всюду), с тёмной обводкой (язык шва).
    if (vPulse > 0.5) {
        float fwm = max(max(fwidth(vUv).x, fwidth(vUv).y), 1e-5);
        // на пути — маленький кружок, на цели — крестик «+» того же размаха (подсказывают, не зовут)
        vec2 u = vUv - 0.5;
        float dd = (length(u) - 0.03) / fwm;
        if (vPulse > 1.5) {
            // плечи по диагоналям клетки: в изометрии (клетка повёрнута на экране на 45°) на экране это прямой «+».
            // Линия 1 px, размах 0,035 клетки от центра
            float diag = min(abs(u.x - u.y), abs(u.x + u.y)) * 0.7071 / fwm - 0.5 * uPx;
            float reach = (max(abs(u.x), abs(u.y)) - 0.035) / fwm;
            dd = max(diag, reach);
        }
        float dotA = 1.0 - smoothstep(-0.5 * uPx, 0.5 * uPx, dd);
        float rimA = (1.0 - smoothstep(0.5 * uPx, 1.5 * uPx, dd)) * (1.0 - dotA);
        // не мерцают, полупрозрачны и серебряные, как курсор: внимание держит курсор с огоньками по рамке, маяки пути просто
        // лежат по дороге
        float a = 0.5 * on;
        gl_FragColor = vec4(uDotColor * dotA * a, max(dotA, rimA * 0.9) * a);
        return;
    }
    // у внешней стороны рама в полную силу, у внутреннего стыка приглушена; у угла берётся более яркая из двух сторон
    float near = 0.3;
    float outer = max(max(ox * smoothstep(near, 0.0, 1.0 - vUv.x), onx * smoothstep(near, 0.0, vUv.x)), max(onz * smoothstep(near, 0.0, 1.0 - vUv.y), opz * smoothstep(near, 0.0, vUv.y)));
    float side = mix(0.45, 1.0, outer);
    // рама из текстуры: серая, с фактурой и уголками, дыра в центре; цвет даёт тонировка
    float frame = texture2D(uFrame, vUv).r;
    float pulse = 1.0 + min(vPulse, 1.0) * 0.3 * sin(uTime * 6.0 - vDist * 1.2);
    float breathe = 0.92 + 0.08 * sin(uTime * 2.0 + vDist * 0.9);
    float fill = 0.012 + 0.02 * (1.0 - min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)) * 2.0);
    float light = frame * side * breathe * pulse;
    vec2 c0 = vUv;
    vec2 c1 = vUv - vec2(1.0, 0.0);
    vec2 c2 = vUv - vec2(0.0, 1.0);
    vec2 c3 = vUv - vec2(1.0, 1.0);
    float fl = flare(c0) + flare(c1) + flare(c2) + flare(c3);
    float nodes = core(c0) + core(c1) + core(c2) + core(c3);
    // в самом центре узла оранжевая вспышка уступает ядру: иначе зелёное с оранжевым складывается в жёлтое
    float keep = 1.0 - clamp(nodes * 1.3, 0.0, 1.0);
    vec3 col = vColor * (light * 1.7 * mix(1.0, keep, 0.7) + fill + fl * 0.75 * breathe * keep) + vNode * nodes * 1.2 * breathe;
    // альфа это «насколько рама закрывает то, что под ней»: голубая сетка под оранжевой рамой гаснет (иначе они складываются
    // в белый), а мягкий свет лишь добавляется сверху
    float cover = clamp(max(frame * 1.4, max(fl, nodes)), 0.0, 1.0);
    // тёмный шов на внутренних стыках (сосед того же вида): каждая клетка рисует свою половину линии в 1 px, вместе целая.
    // Около-чёрный, сквозной (через узлы), через «over»: свет под ним гаснет. Он рассекает световой поток, свет уходит во
    // внутренние углы клеток (STYLE.md)
    {
        vec2 fw = max(fwidth(vUv), vec2(1e-5));
        vec2 e = min(vUv, 1.0 - vUv) / fw;
        float h = 0.5 * uPx;
        vec2 l = 1.0 - smoothstep(vec2(h - 0.5 * uPx), vec2(h + 0.5 * uPx), e);
        // внутренняя ли сторона: у линии x — сторона uv.x = 0 (бит -x) или 1 (бит +x), у линии y — uv.y = 0 (+z) или 1 (-z)
        float innerX = 1.0 - (vUv.x < 0.5 ? onx : ox);
        float innerY = 1.0 - (vUv.y < 0.5 ? opz : onz);
        float seam = max(l.x * innerX, l.y * innerY) * 0.9 * on;
        col *= 1.0 - seam;
        cover = max(cover, seam);
    }
    gl_FragColor = vec4(col * on * (1.0 + flash), cover * on);
}`;
