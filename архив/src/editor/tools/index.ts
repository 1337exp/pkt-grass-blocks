// Инструменты редактора по клавишам 1–3: высота, местность, склон. Новый инструмент: файл рядом и строка здесь.

import type { Stage } from '@shared/view/stage';
import type { Tool } from '../state';
import { heightTool } from './height';
import { slopeTool } from './slope';
import { terrainTool } from './terrain';
import type { EditorTool } from './tool';

export { TOOL_ORDER } from '../state';

export function makeTools(stage: Stage): Record<Tool, EditorTool> {
    return {
        height: heightTool,
        terrain: terrainTool,
        slope: slopeTool(stage),
    };
}
