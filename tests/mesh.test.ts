import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { fillBlock, setCorners } from '@core/ops';
import { rampCorners } from '@core/slope';
import { createReadyWorld } from '@core/world';
import { buildWorldMesh, type PickFace } from '@three/mesh';

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
