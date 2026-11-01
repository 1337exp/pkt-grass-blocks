// Шейдер боков столбиков и «юбок» склонов: тёмно-синие с зерном, книзу уходят в фон.

/** Бока столбиков: тёмно-синие с зерном, грани различает свет с одной стороны, книзу уходят в фон. */
export const sideVert = /* glsl */ `
varying vec3 vWorld;
varying vec3 vN;
void main() {
    vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
}`;

export const sideFrag = /* glsl */ `
uniform vec3 uColor;
uniform sampler2D uNoise;
varying vec3 vWorld;
varying vec3 vN;
void main() {
    float shade = 0.55 + 0.45 * max(0.0, dot(vN, normalize(vec3(0.5, 0.8, 0.3))));
    // зерно по самой грани: по горизонтали вдоль неё, по вертикали высота
    vec2 uv = vec2(abs(vN.x) > 0.5 ? vWorld.z : vWorld.x, vWorld.y) * 0.13;
    float grain = (texture2D(uNoise, uv).r * 255.0 - 24.0) * 0.5;
    float fall = smoothstep(-0.1, 1.2, vWorld.y); // низ уходит в фон
    gl_FragColor = vec4(uColor * shade * (0.82 + 0.36 * grain) * mix(0.35, 1.0, fall), 1.0);
}`;
