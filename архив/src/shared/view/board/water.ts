// Данные воды для шейдера сетки: направление течения, стороны с тенью берега и тепло отражения подсветки. Чистые функции от
// карты: поле пересобирает их вместе с геометрией.

import { type GridMap, isWater } from '../../core/grid';

/**
 * Направление течения для каждой клетки воды (x, z на плоскости): река течёт к большему z, а вбок её ведёт средняя линия русла
 * (центр воды в соседних рядах). Остальным клеткам (0, 1), их это не касается.
 */
export function flowField(map: GridMap): Float32Array {
    const out = new Float32Array(map.cells.length * 2);
    const mid: (number | null)[] = [];
    for (let z = 0; z < map.d; z++) {
        const xs = map.cells.filter((c) => c.z === z && isWater(c.terrain)).map((c) => c.x);
        mid.push(xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    }
    map.cells.forEach((c, i) => {
        let dx = 0;
        const a = mid[c.z - 1] ?? mid[c.z];
        const b = mid[c.z + 1] ?? mid[c.z];
        if (isWater(c.terrain) && a != null && b != null) dx = (b - a) / 2;
        const len = Math.hypot(dx, 1);
        out[i * 2] = dx / len;
        out[i * 2 + 1] = 1 / len;
    });
    return out;
}

/**
 * Стороны клетки воды с тенью берега, битами как у подсветки (+x, −x, −z, +z): у мелководья — сторона к суше, у глубокой воды —
 * ещё и к мелководью (обрыв в русло, туда пройдёт только ховер). У суши 0.
 */
export function shoreMask(map: GridMap): Float32Array {
    const out = new Float32Array(map.cells.length);
    map.cells.forEach((c, i) => {
        if (!isWater(c.terrain)) return;
        const dry = (dx: number, dz: number): boolean => {
            const nb = map.at(c.x + dx, c.z + dz);
            return !!nb && (c.terrain === 'deep' ? nb.terrain !== 'deep' : !isWater(nb.terrain));
        };
        out[i] = (dry(1, 0) ? 1 : 0) + (dry(-1, 0) ? 2 : 0) + (dry(0, -1) ? 4 : 0) + (dry(0, 1) ? 8 : 0);
    });
    return out;
}
