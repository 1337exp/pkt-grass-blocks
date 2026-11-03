import { defineConfig } from 'vitest/config';

export default defineConfig({
    // Относительные пути: сборка работает и в корне, и в подпапке (например, в песочнице сайта).
    base: './',
    test: {
        include: ['tests/**/*.test.ts'],
        passWithNoTests: true,
    },
});
