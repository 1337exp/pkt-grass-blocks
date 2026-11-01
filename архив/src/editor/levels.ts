// Подписи уровней высоты на карте редактора (кнопка «Уровни», клавиша L): на каждой клетке номер её уровня, цвет по ступеням от
// синего (низ) к красному (высоко). Так видно рельеф целиком. Подписи HTML поверх сцены (CSS2D), пересобираются при каждой правке
// клеток. Высота с точностью до сегмента (полуровня): подпись «1.5». Предела высоты редактор не ставит (кроме формата файла, 17.5): сколько уровней нужно карте, решает дизайнер.

import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { isSloped } from '@shared/core/grid';
import type { Doc } from './doc';
import { ed } from './state';

/** Цвета ступеней 0…9: от синего через зелёный и жёлтый к красному. */
export const LEVEL_COLORS = ['#4a6fa5', '#3ba6c8', '#3ecf9a', '#8fd957', '#cfdc4a', '#f2c14e', '#ff9b47', '#ff7a55', '#ff5a5a', '#ff4f8a'];

/** Цвет подписи уровня. */
export const levelColor = (h: number): string => LEVEL_COLORS[Math.min(Math.max(Math.floor(h), 0), LEVEL_COLORS.length - 1)]!;

/** Больше подписей не рисуем: у очень больших карт тысячи HTML-элементов тормозят. */
const MAX_LABELS = 1500;

export class LevelLabels {
    private objs: CSS2DObject[] = [];

    /** Пересобрать подписи под документ (null или выключено — убрать). */
    update(doc: Doc | null): void {
        this.clear();
        ed.levelsTooMany = false;
        if (!doc || !ed.levels) return;
        const cells = doc.map.cells;
        if (cells.length > MAX_LABELS) {
            ed.levelsTooMany = true;
            return;
        }
        for (const c of cells) {
            const el = document.createElement('div');
            el.className = 'level-label';
            el.textContent = isSloped(c) ? `${c.h}↗` : String(c.h);
            el.style.setProperty('--level', levelColor(c.h));
            const obj = new CSS2DObject(el);
            obj.position.copy(doc.board.surface(c, 0.02));
            doc.board.root.add(obj);
            this.objs.push(obj);
        }
    }

    private clear(): void {
        for (const o of this.objs) {
            o.element.remove();
            o.removeFromParent();
        }
        this.objs = [];
    }
}
