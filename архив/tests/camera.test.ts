import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CameraRig, PITCH_TOP, ROTATE_STEP } from '@shared/view/cameraRig';
import { ZOOM_MAX, ZOOM_MIN } from '@shared/view/board/metrics';

describe('камера', () => {
    it('вид сверху и обратно: наклон цели меняется, поворот доворачивается на 45°', () => {
        const rig = new CameraRig();
        const yaw = rig.yawWant;
        rig.setTopView(true);
        expect(rig.topView).toBe(true);
        expect(rig.pitchWant).toBe(PITCH_TOP);
        expect(rig.yawWant).toBeCloseTo(yaw - ROTATE_STEP);
        rig.setTopView(true); // повтор ничего не меняет
        expect(rig.yawWant).toBeCloseTo(yaw - ROTATE_STEP);
        rig.setTopView(false);
        expect(rig.topView).toBe(false);
        expect(rig.yawWant).toBeCloseTo(yaw);
    });

    it('масштаб колесом ограничен пределами, поворот идёт шагами по 45°', () => {
        const rig = new CameraRig();
        for (let k = 0; k < 200; k++) rig.zoomBy(-300);
        expect(rig.zoom).toBe(ZOOM_MAX);
        for (let k = 0; k < 400; k++) rig.zoomBy(300);
        expect(rig.zoom).toBe(ZOOM_MIN);
        const yaw = rig.yawWant;
        rig.rotate(2);
        expect(rig.yawWant).toBeCloseTo(yaw + 2 * ROTATE_STEP);
    });

    it('сдвиг по земле ограничен картой и идёт без задержки', () => {
        const rig = new CameraRig();
        rig.pan(100000, 0, 600, 5);
        expect(Math.abs(rig.targetWant.x)).toBeLessThanOrEqual(5);
        expect(rig.target.x).toBe(rig.targetWant.x);
    });

    it('поворот и цель плавно догоняют желаемое', () => {
        const rig = new CameraRig();
        rig.focus(new THREE.Vector3(4, 0, -3));
        rig.rotate(1);
        const before = rig.yaw;
        for (let k = 0; k < 120; k++) rig.update(0.05, 0.05);
        expect(rig.yaw).toBeGreaterThan(before);
        expect(rig.yaw).toBeCloseTo(rig.yawWant, 3);
        expect(rig.target.x).toBeCloseTo(4, 2);
        expect(rig.target.z).toBeCloseTo(-3, 2);
    });

    it('интро: оборот и наезд за заданное время, в конце камера на обычном месте; пропуск ставит её сразу', () => {
        const rig = new CameraRig();
        const zoom = rig.zoom;
        rig.playIntro(2);
        expect(rig.introActive).toBe(true);
        const k1 = rig.update(0.05, 1);
        expect(k1).toBeCloseTo(0.5);
        expect(Math.abs(rig.yaw - rig.yawWant)).toBeGreaterThan(0.1); // ещё в обороте
        expect(rig.zoom).toBeLessThan(zoom);
        expect(rig.update(0.05, 1)).toBe(1); // последний кадр
        expect(rig.introActive).toBe(false);
        expect(rig.yaw).toBeCloseTo(rig.yawWant);
        expect(rig.zoom).toBeCloseTo(zoom);
        expect(rig.update(0.05, 0.05)).toBeNull();
        rig.playIntro(2);
        expect(rig.skipIntro()).toBe(true);
        expect(rig.yaw).toBe(rig.yawWant);
        expect(rig.zoom).toBe(zoom);
        expect(rig.skipIntro()).toBe(false);
    });
});

describe('пирамидка над юнитом', () => {
    it('повторный показ анимацию не сбрасывает, а скрытие и новый показ сбрасывают', async () => {
        const { SelectMarker } = await import('@shared/view/unitMarker');
        const m = new SelectMarker();
        m.layout(1);
        m.setVisible(true);
        m.update(0.5);
        const turned = m.mesh.rotation.y;
        expect(turned).toBeGreaterThan(0);
        m.setVisible(true); // курсор бежит по клеткам, подсветка обновилась
        m.update(0.1);
        expect(m.mesh.rotation.y).toBeGreaterThan(turned);
        m.setVisible(false);
        m.setVisible(true);
        m.update(0.1);
        expect(m.mesh.rotation.y).toBeLessThan(turned);
    });

    it('без вращения пирамидка только плавает: поворот не меняется, высота качается', async () => {
        const { SelectMarker } = await import('@shared/view/unitMarker');
        const m = new SelectMarker(0xff8a2a, false);
        m.layout(1);
        m.setVisible(true);
        const y0 = m.mesh.position.y;
        m.update(0.3);
        expect(m.mesh.rotation.y).toBe(0);
        expect(m.mesh.position.y).not.toBe(y0);
    });
});
