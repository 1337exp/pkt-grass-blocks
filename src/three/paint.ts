// Цвета граней по умолчанию. Тема карты подменяет их: верх, бок и низ одного материала могут различаться.
// Сетка клеток рисуется отдельно, поэтому ковёр травы и тактическая сетка живут на одной геометрии.

export type FaceKind = 'top' | 'side' | 'bottom';

export interface FacePaint {
    top: number;
    side: number;
    bottom: number;
}

export const FACE_PAINT: Record<string, FacePaint> = {
    grass: { top: 0x7dae4a, side: 0x6a8a3a, bottom: 0x4d6230 },
    dirt: { top: 0x8d6b43, side: 0x745636, bottom: 0x5a4128 },
    rock: { top: 0x9aa196, side: 0x7a7d76, bottom: 0x5c5f59 },
    sand: { top: 0xd2c093, side: 0xb5a47a, bottom: 0x8c7d58 },
    wood: { top: 0xb5895d, side: 0x8f6843, bottom: 0x6e4e32 },
    water: { top: 0x3f86b0, side: 0x2f6d94, bottom: 0x245674 },
    wall: { top: 0x6e655c, side: 0x564e47, bottom: 0x3e3833 },
};

export function facePaint(material: string): FacePaint {
    return FACE_PAINT[material] ?? { top: 0x8a8a8a, side: 0x707070, bottom: 0x555555 };
}
