import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

const dir = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            '@core': dir('./src/core'),
            '@three': dir('./src/three'),
        },
    },
    test: {
        include: ['tests/**/*.test.ts'],
    },
});
