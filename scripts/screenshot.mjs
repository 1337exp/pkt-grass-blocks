#!/usr/bin/env node
/**
 * Screenshot of the running scene for the README.
 *
 *   npm run screenshot                        starts its own dev server on a spare port
 *   SCREENSHOT_URL=http://localhost:5173 npm run screenshot    use a server that is already running
 *
 * Needs Chrome or Edge installed (driven through playwright-core, nothing is downloaded).
 * Output: docs/media/overview.png. WebGL is rendered in software, so the shot takes a few seconds.
 * Pass query parameters of your own after `--`: npm run screenshot -- --name closeup --zoom 2.2 --yaw 0.9
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'media');
mkdirSync(OUT, { recursive: true });

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);
const name = option('name', 'overview');
const zoom = option('zoom', '2');
const yaw = option('yaw', null);

async function waitFor(url, ms = 30000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        try {
            if ((await fetch(url)).ok) return;
        } catch {
            // not up yet
        }
        await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error(`The dev server did not come up at ${url}`);
}

async function startServer() {
    if (process.env.SCREENSHOT_URL) return { url: process.env.SCREENSHOT_URL, stop() {} };
    const vite = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
    const port = 5189;
    const child = spawn(process.execPath, [vite, '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
    const url = `http://localhost:${port}`;
    await waitFor(url);
    return { url, stop: () => child.kill() };
}

async function launch() {
    // Software WebGL, so it works without a GPU and in headless mode.
    const flags = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
    for (const channel of ['chrome', 'msedge']) {
        try {
            return await chromium.launch({ channel, args: flags });
        } catch {
            // try the next one
        }
    }
    throw new Error('Neither Chrome nor Edge could be launched');
}

const server = await startServer();
const browser = await launch();
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await page.goto(server.url);
    await page.waitForSelector('canvas');
    // only the scene is wanted: hide the settings panel and the hint, then give the textures time to arrive
    await page.addStyleTag({ content: '.panel, .note { display: none !important; }' });
    if (zoom) await page.mouse.wheel(0, -Number(zoom) * 100);
    if (yaw) {
        await page.mouse.move(720, 450);
        await page.mouse.down();
        await page.mouse.move(720 + Number(yaw) * 100, 450, { steps: 12 });
        await page.mouse.up();
    }
    await page.waitForTimeout(2500);
    await page.screenshot({ path: join(OUT, `${name}.png`) });
    console.log(`docs/media/${name}.png`);
} finally {
    await browser.close();
    server.stop();
}
