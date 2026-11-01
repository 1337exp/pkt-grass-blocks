import { describe, expect, it } from 'vitest';
import { skyTint, sunAt } from '@three/sky';

describe('солнце', () => {
    it('в шесть и в восемнадцать на горизонте, в полдень высоко, в полночь под ним', () => {
        expect(sunAt(6).elevation).toBeCloseTo(0, 5);
        expect(sunAt(18).elevation).toBeCloseTo(0, 5);
        expect(sunAt(12).elevation).toBeGreaterThan(0.8);
        expect(sunAt(0).elevation).toBeLessThan(0);
        expect(sunAt(0).y).toBeLessThan(0);
        expect(sunAt(12).y).toBeGreaterThan(0);
    });

    it('рассвет теплее полудня, ночь темнее дня', () => {
        const dawn = skyTint(sunAt(6.4).elevation);
        const noon = skyTint(sunAt(12).elevation);
        const night = skyTint(sunAt(0).elevation);
        expect(dawn.sun).not.toBe(noon.sun);
        expect(night.intensity).toBeLessThan(noon.intensity);
        expect(night.background).not.toBe(noon.background);
    });
});
