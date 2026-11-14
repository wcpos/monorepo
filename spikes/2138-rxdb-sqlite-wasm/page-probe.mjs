// Runs the bundled page probe (premium worker storage -> spike worker) in headless Chromium.
// Run from the repo root after run-conformance.sh has bundled the worker:
//   node spikes/2138-rxdb-sqlite-wasm/page-probe.mjs
// (page-probe-entry.mjs is bundled by esbuild into the same static dir as the worker.)
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const FILES = fileURLToPath(new URL('./.rxdb-src/docs-src/static/files/spike-2138/', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (m) => console.log('[page]', m.type(), m.text().slice(0, 400)));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.route('http://localhost:18999/**', async (route) => {
	const url = new URL(route.request().url());
	if (url.pathname === '/') {
		return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>probe</title><script type="module" src="/files/spike-2138/page-probe.js"></script>' });
	}
	const name = url.pathname.replace('/files/spike-2138/', '');
	try {
		const body = await readFile(FILES + name);
		const contentType = name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript';
		return route.fulfill({ contentType, body });
	} catch {
		console.log('[server] 404', url.pathname);
		return route.fulfill({ status: 404, body: 'nope' });
	}
});
await page.goto('http://localhost:18999/');
await page.waitForFunction(() => typeof globalThis.runProbe === 'function');
try {
	const r = await page.evaluate(() => globalThis.runProbe());
	console.log('[result]', r);
} catch (e) {
	console.log('[probe failed]', e.message.slice(0, 600));
	process.exitCode = 1;
}
await browser.close();
