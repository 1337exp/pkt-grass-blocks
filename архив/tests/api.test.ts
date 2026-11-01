import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApi } from '@server/api';

let root = '';
let server: Server;
let base = '';

const mini = { version: 3, name: 'Мини', size: [2, 1], height: ['24'], terrain: ['..'], slopes: [], entities: [] };

beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'tactics-api-'));
    const api = createApi(root);
    // как в Vite: middleware видит путь без префикса /api
    server = createServer((req, res) => {
        req.url = req.url!.replace(/^\/api/, '');
        api(req, res, () => {
            res.statusCode = 404;
            res.end();
        });
    });
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://localhost:${(server.address() as AddressInfo).port}/api`;
});

afterAll(async () => {
    server.close();
    await rm(root, { recursive: true, force: true });
});

const put = (id: string, body: unknown): Promise<Response> => fetch(`${base}/maps/${id}`, { method: 'PUT', body: JSON.stringify(body) });

describe('API карт', () => {
    it('пишет карту в public/maps в своём формате и отдаёт её обратно', async () => {
        expect((await put('mini', mini)).status).toBe(200);
        const text = await readFile(join(root, 'public', 'maps', 'mini.json'), 'utf-8');
        expect(text).toContain('"height": [\n        "24"\n    ]');
        expect(await (await fetch(`${base}/maps`)).json()).toEqual(['mini']);
        expect(JSON.parse(await (await fetch(`${base}/maps/mini`)).text()).name).toBe('Мини');
    });

    it('битую карту не пишет и объясняет почему', async () => {
        const res = await put('bad', { ...mini, terrain: ['.?'] });
        expect(res.status).toBe(400);
        expect(((await res.json()) as { error: string }).error).toMatch(/неизвестный символ/);
        expect(await (await fetch(`${base}/maps`)).json()).toEqual(['mini']);
    });

    it('не выпускает из папки карт', async () => {
        expect((await put('..%2Fhack', mini)).status).toBe(400);
        expect((await fetch(`${base}/maps/nope`)).status).toBe(404);
    });
});
