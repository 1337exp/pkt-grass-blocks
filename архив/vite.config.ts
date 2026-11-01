import { fileURLToPath, URL } from 'node:url';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

const dir = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

/** API карт в dev-сервере: список, чтение и запись public/maps. */
const editorApi = (): Plugin => ({
    name: 'editor-api',
    apply: 'serve',
    configureServer(server) {
        server.middlewares.use('/api', async (req, res, next) => {
            try {
                const { createApi } = await server.ssrLoadModule('/src/server/api.ts');
                createApi(dir('.'))(req, res, next);
            } catch (e) {
                next(e);
            }
        });
    },
});

export default defineConfig({
    plugins: [vue(), editorApi()],
    resolve: {
        alias: {
            '@shared': dir('./src/shared'),
            '@editor': dir('./src/editor'),
            '@server': dir('./src/server'),
            '@core': dir('./src-exp/core'),
            '@three': dir('./src-exp/three'),
        },
    },
    test: {
        include: ['tests/**/*.test.ts', 'tests-exp/**/*.test.ts'],
    },
});
