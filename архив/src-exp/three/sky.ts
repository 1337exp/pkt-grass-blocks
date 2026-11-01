// Солнце на одних часах. Утро, день, вечер и ночь — участки одной кривой, а не четыре режима карты.
// Высота солнца: 0 на горизонте в 6 и в 18, выше всего в полдень, ниже горизонта ночью.

export interface SunPose {
    /** Радианы, плюс — над горизонтом. */
    elevation: number;
    azimuth: number;
    x: number;
    y: number;
    z: number;
}

export interface SkyTint {
    background: number;
    fog: number;
    sun: number;
    ambient: number;
    /** Сила направленного света. Ночью остаётся слабый заполняющий. */
    intensity: number;
}

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

function mix(a: number, b: number, t: number): number {
    const u = clamp(t, 0, 1);
    const ch = (shift: number) => {
        const from = (a >> shift) & 255;
        const to = (b >> shift) & 255;
        return Math.round(from + (to - from) * u);
    };
    return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** Положение солнца в час `hour` (0…24). */
export function sunAt(hour: number): SunPose {
    const h = ((hour % 24) + 24) % 24;
    const elevation = Math.sin(((h - 6) / 12) * Math.PI) * (Math.PI / 3);
    const azimuth = ((h - 6) / 12) * Math.PI;
    const cosE = Math.cos(elevation);
    return { elevation, azimuth, x: cosE * Math.sin(azimuth), y: Math.sin(elevation), z: cosE * Math.cos(azimuth) };
}

/** Цвета неба и свет от высоты солнца. Низкое солнце теплее. */
export function skyTint(elevation: number): SkyTint {
    const high = elevation / (Math.PI / 3);
    const day = clamp((high + 0.08) / 0.55, 0, 1);
    const warm = Math.exp(-((high - 0.02) ** 2) / 0.02);
    const background = mix(mix(0x0e1628, 0x9ec4e4, day), 0xe7a06a, warm * (1 - day * 0.75));
    const fog = mix(background, 0xc4d7e6, day * 0.35);
    const sun = mix(0xf0c8a0, 0xfff4e0, day);
    return { background, fog, sun, ambient: 0.08 + day * 0.28, intensity: 0.2 + day * 2.1 };
}
