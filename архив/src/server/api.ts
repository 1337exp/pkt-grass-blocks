// API редактора карт: список карт, чтение и запись public/maps/*.json. Браузер сам не может записать файл в папку проекта,
// поэтому редактор сохраняет через этот API. Работает как обычный node-middleware в dev-сервере Vite (см. vite.config.ts):
// отдельный процесс не нужен, в сборку игры не попадает. Игра читает те же файлы напрямую.
//
//   GET /api/maps          → ["ford", ...]
//   GET /api/maps/<id>     → текст карты
//   PUT /api/maps/<id>     ← JSON карты; проверяется parseMap и пишется formatMap (на диск не попадает битая карта, а формат
//                            файла всегда один, как бы редактор её ни прислал)

import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { formatMap, MapError, parseMap, toMapFile } from '../shared/core/mapFile';

/** Имя карты: буквы, цифры, «-» и «_» (оно же имя файла и `?map=` в игре). */
const ID = /^[\w-]+$/;

function send(res: ServerResponse, status: number, body: unknown, type = 'application/json; charset=utf-8'): void {
    res.statusCode = status;
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'no-store');
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
    const parts: Buffer[] = [];
    for await (const p of req) parts.push(p as Buffer);
    return JSON.parse(Buffer.concat(parts).toString('utf-8'));
}

/** `root`: корень проекта. */
export function createApi(root: string): (req: IncomingMessage, res: ServerResponse, next: () => void) => void {
    const dir = join(root, 'public', 'maps');

    async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
        const url = new URL(req.url ?? '/', 'http://x');
        // Vite отдаёт путь уже без префикса /api
        const path = url.pathname.replace(/^\/api/, '');
        const method = req.method ?? 'GET';

        if (method === 'GET' && path === '/maps') {
            const files = existsSync(dir) ? await readdir(dir) : [];
            send(res, 200, files.filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort());
            return true;
        }
        const m = /^\/maps\/([^/]+)$/.exec(path);
        if (!m) return false;
        const id = decodeURIComponent(m[1]!);
        if (!ID.test(id)) {
            send(res, 400, { error: `имя карты «${id}»: только буквы, цифры, - и _` });
            return true;
        }
        const file = join(dir, `${id}.json`);
        if (method === 'GET') {
            if (!existsSync(file)) send(res, 404, { error: `карты «${id}» нет` });
            else send(res, 200, await readFile(file, 'utf-8'));
            return true;
        }
        if (method === 'PUT') {
            const { name, map, entities } = parseMap(await readBody(req));
            await mkdir(dir, { recursive: true });
            await writeFile(file, formatMap(toMapFile(name, map, entities)));
            send(res, 200, { ok: true, id });
            return true;
        }
        return false;
    }

    return (req, res, next) => {
        handle(req, res)
            .then((done) => {
                if (!done) next();
            })
            .catch((e: unknown) => send(res, e instanceof MapError || e instanceof SyntaxError ? 400 : 500, { error: (e as Error).message }));
    };
}
