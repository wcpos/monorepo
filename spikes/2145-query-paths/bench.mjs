import { readFile, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, release } from 'node:os';

import { chromium } from 'playwright';

const files = new URL('./.rxdb-src/docs-src/static/files/spike-2145/', import.meta.url);
const deps = new URL('../2138-rxdb-sqlite-wasm/.rxdb-src/node_modules/', import.meta.url);
const browser = await chromium.launch({ channel: 'chrome' });
let timer;
try {
	const page = await browser.newPage(),
		errors = [];
	page.on('console', (m) => console.info('[page]', m.type(), m.text()));
	page.on('pageerror', (e) => {
		errors.push(String(e));
		console.error(e);
	});
	page.on('worker', (w) => w.on('close', () => console.info('[worker closed]', w.url())));
	await page.route('http://localhost:18999/**', async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path === '/')
			return route.fulfill({
				contentType: 'text/html',
				body: '<!doctype html><script type="module" src="/files/spike-2145/bench.js"></script>',
			});
		try {
			const name = path.split('/').at(-1),
				body = await readFile(new URL(name, files));
			await route.fulfill({
				contentType: name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript',
				body,
			});
		} catch (e) {
			console.error(e);
			await route.fulfill({ status: 404, body: 'missing bundle' });
		}
	});
	await page.goto('http://localhost:18999/');
	await page.waitForFunction(() => typeof globalThis.runBench === 'function');
	const result = await Promise.race([
		page.evaluate(() => globalThis.runBench()),
		new Promise((_, reject) => {
			timer = setTimeout(
				() => reject(new Error('Benchmark exceeded 150 minutes')),
				150 * 60 * 1000
			);
		}),
	]);
	if (errors.length) throw new Error(errors.join('\n'));
	const versions = {};
	for (const pkg of ['rxdb', 'rxdb-premium', '@sqlite.org/sqlite-wasm', 'esbuild'])
		versions[pkg] = JSON.parse(await readFile(new URL(`${pkg}/package.json`, deps))).version;
	result.environment = {
		chrome: browser.version(),
		node: process.version,
		os: `${platform()} ${release()} ${arch()}`,
		cpu: cpus()[0].model,
		versions,
		measuredAt: new Date().toISOString(),
		vfs: 'opfs-sahpool',
		journal: 'WAL',
	};
	await writeFile(
		new URL('./results.json', import.meta.url),
		JSON.stringify(result, null, 2) + '\n'
	);
	console.info(`Wrote results.json: ${result.cells.length} cells.`);
} finally {
	clearTimeout(timer);
	await browser.close();
}
