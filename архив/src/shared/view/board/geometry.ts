// Геометрия поля по карте: столбики, верх клеток (с атрибутами для шейдера сетки), «юбки» склонов, края уступов и вертикали.
// Чистые функции «карта → меш» с готовыми материалами: поле собирает их при создании и при пересборке после правки карты.

import * as THREE from 'three';
import { type Cell, foldDiagonal, isWater, type Terrain } from '../../core/grid';
import { type Metrics, SIDES } from './metrics';
import { ribbons, type Segment } from './ribbon';
import { flowField, shoreMask } from './water';

/** Номер местности для шейдера сетки: от него узор (бурелом в точку, вода, стена без сетки). */
const TERRAIN_KIND: Record<Terrain, number> = { plain: 0, road: 1, rough: 2, shallow: 3, deep: 4, wall: 5 };
/** Цвет заливки клетки: почти чёрный, местность различается лишь оттенком. */
const TINT: Record<Terrain, number> = {
    plain: 0x101a1f,
    road: 0x1a2128,
    rough: 0x0c1518,
    shallow: 0x13283a,
    deep: 0x030918,
    wall: 0x0b1017,
};

/** Квадрат клетки для cellQuadGlsl: 6 вершин, слоты углов для обеих диагоналей (треугольники смотрят вверх). */
export function cellQuadGeometry(): THREE.BufferGeometry {
    // uv углов: v0 (x−,z−) = (0,1), v1 (x+,z−) = (1,1), v2 (x+,z+) = (1,0), v3 (x−,z+) = (0,0)
    const v0 = [0, 1];
    const v1 = [1, 1];
    const v2 = [1, 0];
    const v3 = [0, 0];
    const a = [...v0, ...v3, ...v2, ...v0, ...v2, ...v1]; // диагональ v0–v2
    const b = [...v0, ...v3, ...v1, ...v1, ...v3, ...v2]; // диагональ v1–v3
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Array(18).fill(0), 3)); // настоящее место считает шейдер
    g.setAttribute('aSlotA', new THREE.Float32BufferAttribute(a, 2));
    g.setAttribute('aSlotB', new THREE.Float32BufferAttribute(b, 2));
    return g;
}

/** Столбики до нижнего уровня каждой клетки. Номер экземпляра совпадает с индексом клетки. */
export function buildColumns(m: Metrics, material: THREE.Material): THREE.InstancedMesh {
    const cells = m.map.cells;
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, cells.length);
    const mat = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    cells.forEach((c, i) => {
        const top = m.topY(c);
        const { x, z } = m.center(c);
        mat.compose(new THREE.Vector3(x, top / 2, z), q, new THREE.Vector3(1, top, 1));
        mesh.setMatrixAt(i, mat);
    });
    mesh.raycast = () => {}; // выбор мышью свой (Board.pick)
    return mesh;
}

/**
 * Верх клеток: квадрат на каждую клетку (cellQuadGlsl), атрибуты для шейдера сетки (цвет, местность, уровень, берега, диагональ
 * сгиба, подъёмы углов, течение).
 */
/**
 * Есть ли у клетки край уступа со стороны (dx, dz): сосед ниже хотя бы у одного конца стороны (бок пандуса у ровной клетки ниже
 * только у верхнего конца). Между двумя клетками воды края нет: «мелко → глубоко» показывает тень.
 */
function cliffSide(m: Metrics, c: Cell, dx: number, dz: number): boolean {
    const nb = m.map.at(c.x + dx, c.z + dz);
    if (nb && isWater(c.terrain) && isWater(nb.terrain)) return false;
    const [a, b] = m.sideEnds(c, dx, dz);
    const na = nb ? m.heightAt(nb, a.x, a.z) : 0;
    const nbb = nb ? m.heightAt(nb, b.x, b.z) : 0;
    return na < m.heightAt(c, a.x, a.z) - 0.01 || nbb < m.heightAt(c, b.x, b.z) - 0.01;
}

export function buildTops(m: Metrics, material: THREE.Material): THREE.InstancedMesh {
    const cells = m.map.cells;
    const n = cells.length;
    const g = cellQuadGeometry();
    const mesh = new THREE.InstancedMesh(g, material, n);
    const corners = new Float32Array(n * 4);
    const tint = new Float32Array(n * 3);
    const info = new Float32Array(n * 4);
    const shore = shoreMask(m.map);
    const color = new THREE.Color();
    cells.forEach((c, i) => {
        mesh.setMatrixAt(i, m.topMatrix(c, 0.001));
        corners.set(m.cornerOffsets(c), i * 4);
        color.setHex(TINT[c.terrain]).toArray(tint, i * 3);
        // упаковано в один атрибут (слотов у вершины немного): местность, уровень, берега, диагональ сгиба
        info.set([TERRAIN_KIND[c.terrain], c.h, shore[i]!, foldDiagonal(c) === 'b' ? 1 : 0], i * 4);
    });
    g.setAttribute('aCorners', new THREE.InstancedBufferAttribute(corners, 4));
    g.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 3));
    g.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 4));
    g.setAttribute('aFlow', new THREE.InstancedBufferAttribute(flowField(m.map), 2));
    mesh.frustumCulled = false; // настоящее место вершин знает только шейдер
    mesh.raycast = () => {};
    return mesh;
}

/**
 * Бока склонов («юбки»): на каждой стороне клетки, где угол поднят, — трапеция или треугольник от нижнего уровня до наклонного
 * верха. Столбик доходит только до нижнего уровня, юбки закрывают остальное. Материал — бока без инстансинга.
 */
export function buildSkirts(m: Metrics, material: THREE.Material): THREE.Mesh {
    const pos: number[] = [];
    const ring = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
    ] as const;
    for (const c of m.map.cells) {
        if (!c.corners) continue;
        const base = m.topY(c);
        for (let s = 0; s < 4; s++) {
            const [ax, az] = ring[s]!;
            const [bx, bz] = ring[(s + 1) % 4]!;
            const a = m.cornerPoint(c, ax, az);
            const b = m.cornerPoint(c, bx, bz);
            if (a.y <= base + 1e-4 && b.y <= base + 1e-4) continue;
            pos.push(a.x, base, a.z, b.x, base, b.z, b.x, b.y, b.z, a.x, base, a.z, b.x, b.y, b.z, a.x, a.y, a.z);
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, material);
    mesh.raycast = () => {};
    return mesh;
}

/**
 * Края уступов там, где сосед ниже, по реальной высоте краёв (у пандуса край наклонный). Линия сдвинута чуть наружу и вверх от
 * ребра столбика: ровно на ребре её глубина совпадает с гранью, и при движении камеры видеокарта то рисует линию, то закрывает её
 * гранью (мерцание). Между двумя клетками воды линию не рисуем: «мелко → глубоко» показывает тень.
 */
export function buildEdges(m: Metrics, material: THREE.Material): THREE.Mesh {
    const segs: Segment[] = [];
    const out = 0.006;
    for (const c of m.map.cells) {
        for (const [dx, dz] of SIDES) {
            if (c.corners) {
                slopeSide(m, c, dx, dz, out, segs);
                continue;
            }
            if (!cliffSide(m, c, dx, dz)) continue;
            const [a, b] = m.sideEnds(c, dx, dz);
            const ya = m.heightAt(c, a.x, a.z);
            const yb = m.heightAt(c, b.x, b.z);
            segs.push({ a: [a.x + dx * out, ya + 0.004, a.z + dz * out], b: [b.x + dx * out, yb + 0.004, b.z + dz * out], ta: 0, tb: 0 });
        }
    }
    return ribbons(segs, material);
}

/**
 * Сторона клетки со склоном: край пандуса наклонный, и сосед может быть ниже него в одной части стороны и выше в другой (стенка
 * соседнего сегмента). Сторона делится там, где край сравнялся с верхом соседа. Часть над соседом: край уступа, лента снаружи, как у
 * ровной клетки. Часть под верхом соседа: пандус упирается в его стенку, и линия по поверхности пандуса у основания стенки сплошная
 * (лента чуть внутрь клетки), иначе её закрывает колонка соседа и остаётся лишь пунктир сетки.
 */
function slopeSide(m: Metrics, c: Cell, dx: number, dz: number, out: number, segs: Segment[]): void {
    const nb = m.map.at(c.x + dx, c.z + dz);
    if (nb && isWater(c.terrain) && isWater(nb.terrain)) return;
    const [a, b] = m.sideEnds(c, dx, dz);
    const ya = m.heightAt(c, a.x, a.z);
    const yb = m.heightAt(c, b.x, b.z);
    const na = nb ? m.heightAt(nb, a.x, a.z) : 0;
    const nbb = nb ? m.heightAt(nb, b.x, b.z) : 0;
    const d0 = ya - na;
    const d1 = yb - nbb;
    const cuts = d0 * d1 < 0 ? [0, d0 / (d0 - d1), 1] : [0, 1];
    for (let k = 0; k + 1 < cuts.length; k++) {
        const s0 = cuts[k]!;
        const s1 = cuts[k + 1]!;
        const dm = (d0 + (d1 - d0) * (s0 + s1) / 2);
        if (Math.abs(dm) < 0.01) continue; // край вровень с соседом: линию даёт сетка
        const side = dm > 0 ? 1 : -1; // снаружи (сосед ниже) или внутрь (сосед выше)
        // на стыке двух частей смещение сходит на нет, чтобы линия не ломалась скачком с наружной стороны на внутреннюю
        const at = (t: number, shift: number): [number, number, number] => [a.x + (b.x - a.x) * t + dx * shift, ya + (yb - ya) * t + 0.004, a.z + (b.z - a.z) * t + dz * shift];
        segs.push({ a: at(s0, k > 0 ? 0 : out * side), b: at(s1, k + 2 < cuts.length ? 0 : out * side), ta: 0, tb: 0 });
    }
}

/**
 * Вертикали уступов на углах клеток над обрывом: по одной на угол (самая длинная), лентами, гаснущими книзу. Высоты берутся в самом
 * углу (у пандуса угол поднятого края выше). Лента стоит чуть снаружи угла, чтобы не врезаться в грани своего столбика.
 */
export function buildRisers(m: Metrics, material: THREE.Material): THREE.Mesh {
    const best = new Map<string, { x: number; z: number; top: number; low: number; ox: number; oz: number }>();
    for (const c of m.map.cells) {
        const { x, z } = m.center(c);
        for (const [dx, dz] of SIDES) {
            const nb = m.map.at(c.x + dx, c.z + dz);
            if (nb && isWater(c.terrain) && isWater(nb.terrain)) continue;
            for (const p of m.sideEnds(c, dx, dz)) {
                const top = m.heightAt(c, p.x, p.z);
                const low = nb ? m.heightAt(nb, p.x, p.z) : 0;
                if (low >= top - 0.01) continue;
                const key = `${p.x.toFixed(2)},${p.z.toFixed(2)}`;
                const was = best.get(key);
                if (was && was.top - was.low >= top - low) continue;
                // наружу от центра клетки по диагонали угла
                best.set(key, { x: p.x, z: p.z, top, low, ox: Math.sign(p.x - x), oz: Math.sign(p.z - z) });
            }
        }
    }
    const segs: Segment[] = [];
    for (const r of best.values()) {
        const px = r.x + r.ox * 0.006;
        const pz = r.z + r.oz * 0.006;
        segs.push({ a: [px, r.top + 0.004, pz], b: [px, r.low, pz], ta: 0, tb: 1 });
    }
    return ribbons(segs, material);
}

