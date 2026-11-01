// Обращения редактора к API dev-сервера (src/server/api.ts): список карт, чтение, запись. Ответы с ошибкой превращаются в Error
// с текстом сервера (он объясняет, что не так с картой).

import { type LoadedMap, type MapFile, parseMap } from '@shared/core/mapFile';

async function call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`/api${path}`, { cache: 'no-store', ...init });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error((body as { error?: string } | null)?.error ?? `сервер ответил ${res.status}`);
    return body as T;
}

export const listMaps = (): Promise<string[]> => call<string[]>('/maps');

/** Карта из файла, разобранная и проверенная той же функцией, что у игры. */
export async function readMap(id: string): Promise<LoadedMap> {
    return parseMap(await call<unknown>(`/maps/${encodeURIComponent(id)}`));
}

export function writeMap(id: string, file: MapFile): Promise<{ ok: true }> {
    return call(`/maps/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(file) });
}
