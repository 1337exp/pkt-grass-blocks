import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { fillBlock, setCorners } from '@core/ops';
import { rampCorners } from '@core/slope';
import { createReadyWorld } from '@core/world';
import { buildWorldMesh, type PickFace } from '@three/mesh';
import { faceTexture } from '@three/tiles';

function sideNormals(corners: [number, number, number, number]): { pick: PickFace; n: THREE.Vector3; top: number }[] {
    let world = fillBlock(createReadyWorld(), 0, 0, 0, 'grass');
    world = setCorners(world, 0, 0, 0, corners);
    const group = buildWorldMesh(world);
    const out: { pick: PickFace; n: THREE.Vector3; top: number }[] = [];
    group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        const picks = mesh.userData.picks as PickFace[] | undefined;
        const normal = mesh.geometry.getAttribute('normal');
        const position = mesh.geometry.getAttribute('position');
        if (!picks || !normal || !position) return;
        picks.forEach((pick, i) => {
            if (pick.kind !== 'side') return;
            const base = i * 3;
            const top = Math.max(position.getY(base), position.getY(base + 1), position.getY(base + 2));
            out.push({ pick, n: new THREE.Vector3(normal.getX(base), normal.getY(base), normal.getZ(base)), top });
        });
    });
    group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        const mat = mesh.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
    });
    return out;
}

describe('юбка склона', () => {
    it('пандус закрыт с боков, и нормаль смотрит наружу', () => {
        const skirt = sideNormals(rampCorners({ dx: 1, dz: 0 })).filter((s) => s.top > 1.01);
        expect(skirt.filter((s) => s.pick.nz === 1)).toHaveLength(1);
        expect(skirt.filter((s) => s.pick.nz === -1)).toHaveLength(1);
        expect(skirt.filter((s) => s.pick.nx === 1)).toHaveLength(2);
        for (const { pick, n } of skirt) expect(n.dot(new THREE.Vector3(pick.nx, 0, pick.nz))).toBeGreaterThan(0.9);
    });

    it('один поднятый угол тоже закрывает треугольный борт снаружи', () => {
        const skirt = sideNormals([0, 1, 0, 0]).filter((s) => s.top > 1.01);
        expect(skirt.length).toBeGreaterThan(0);
        for (const { pick, n } of skirt) expect(n.dot(new THREE.Vector3(pick.nx, 0, pick.nz))).toBeGreaterThan(0.9);
    });
});

describe('тайлы граней', () => {
    it('кромка дёрна только на верхнем ряду, ниже камень, и v растёт к верху грани', () => {
        let world = fillBlock(createReadyWorld(), 2, 2, 0, 'grass');
        world = fillBlock(world, 2, 2, 1, 'grass');
        const group = buildWorldMesh(world);
        const tiles = new Set<string>();
        group.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            if (!mesh.isMesh || !mesh.userData.tile) return;
            tiles.add(mesh.userData.tile as string);
            const picks = mesh.userData.picks as PickFace[];
            const position = mesh.geometry.getAttribute('position');
            const uv = mesh.geometry.getAttribute('uv');
            picks.forEach((pick, i) => {
                if (pick.kind !== 'side') return;
                const base = i * 3;
                let lowY = Infinity;
                let highY = -Infinity;
                let lowV = 0;
                let highV = 0;
                for (let k = 0; k < 3; k++) {
                    const py = position.getY(base + k);
                    const pv = uv.getY(base + k);
                    if (py < lowY) {
                        lowY = py;
                        lowV = pv;
                    }
                    if (py > highY) {
                        highY = py;
                        highV = pv;
                    }
                }
                if (highY - lowY > 0.2) expect(highV).toBeGreaterThan(lowV);
            });
        });
        expect(tiles.has('grass:side:lip')).toBe(true);
        expect(tiles.has('grass:side:main')).toBe(true);
    });

    it('кромка дёрна берёт картинку тайла', () => {
        const tex = faceTexture('grass', 'side', 'lip');
        if (tex instanceof THREE.DataTexture) {
            const data = tex.image.data as Uint8Array;
            const width = tex.image.width;
            const height = tex.image.height;
            const at = (x: number, y: number) => {
                const i = (y * width + x) * 4;
                return [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0] as const;
            };
            const top = at(20, height - 2);
            const bottom = at(20, 8);
            expect(top[1]).toBeGreaterThan(top[0]);
            expect(bottom[0]).toBeGreaterThan(bottom[1] - 40);
            return;
        }
        expect(tex.image).toBeTruthy();
    });
});
