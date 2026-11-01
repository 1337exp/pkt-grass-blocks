// Шейдер линии атаки (attack.ts): лента над полем, повёрнутая шириной к камере, края сглажены по пикселю. По оси узкая линия цвета атаки (uColor),
// поверх неё к цели бегут шире линии стрелки-шевроны цвета хода (uChev): действие «движется» к цели. У героя лента проявляется из
// корпуса, у цели гаснет (uLen — длина ленты, uLine — полуширина линии в долях ленты).

import { edgeFadeGlsl } from './common';

export const tapeVert = /* glsl */ `
attribute float aAcross;
attribute float aAlong;
attribute vec3 aDir;
uniform float uHalf;
varying float vAcross;
varying float vAlong;
void main() {
    vAcross = aAcross;
    vAlong = aAlong;
    // ширина ленты поперёк взгляда камеры (а не лежит плашмя): сбоку лента остаётся видна, а не ребром. Вдоль взгляда (отвесный ход при
    // виде сверху) поперёк берётся мировая ось x
    vec3 dir = normalize(mat3(modelMatrix) * aDir);
    vec3 forward = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
    vec3 side = cross(dir, forward);
    float len = length(side);
    side = len > 1e-3 ? side / len : vec3(1.0, 0.0, 0.0);
    vec4 world = modelMatrix * vec4(position, 1.0);
    world.xyz += side * aAcross * uHalf;
    gl_Position = projectionMatrix * viewMatrix * world;
}`;

export const tapeFrag = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uChev;
uniform float uLine;
uniform float uOpacity;
uniform float uTime;
uniform float uLen;
varying float vAcross;
varying float vAlong;
${edgeFadeGlsl}
void main() {
    // край ленты сглажен на пиксель при любом масштабе и наклоне
    float a = 1.0 - smoothstep(1.0 - fwidth(vAcross) * 1.5, 1.0, abs(vAcross));
    // у героя лента выходит из корпуса: первые полклетки проявляется
    float start = smoothstep(0.1, 0.6, vAlong);
    // линия по оси: уже ленты
    float ax = abs(vAcross);
    float line = 1.0 - smoothstep(uLine - fwidth(vAcross) * 1.5, uLine, ax);
    // шевроны остриём к цели на всю ширину ленты (45°: отступ вдоль равен отступу от оси, у полуширины 0,16), раз в 0,5 клетки, штрих толщиной
    // 0,2 клетки вдоль хода (вдвое жирнее прежних 0,1), бегут 0,8 клетки в секунду
    float g = fract((vAlong + ax * 0.16) / 0.5 - uTime * 1.6);
    float fwg = fwidth(g) * 1.5;
    float chev = smoothstep(0.0, fwg, g) * (1.0 - smoothstep(0.4 - fwg, 0.4, g));
    float lineA = line * 0.8;
    float mixChev = chev / max(max(chev, lineA), 1e-4);
    // стрелки без свечения: цвет ниже порога блума сцены (на 1,3 и 1,1 толстые стрелки светили прожектором)
    vec3 col = mix(uColor * 0.95, uChev * 0.8, mixChev);
    a *= max(lineA, chev);
    // у цели гаснет: последние полклетки
    a *= 1.0 - smoothstep(uLen - 0.5, uLen - 0.1, vAlong);
    a *= start * edgeFade();
    if (a <= 0.003) discard;
    gl_FragColor = vec4(col, a * uOpacity);
}`;
