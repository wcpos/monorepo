// Release gate: shipped worker/wasm, WAL enforcement, reopen and OPFS persistence (#2242).
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { build, transform } from 'esbuild';
import { chromium } from 'playwright';

const dir = await mkdtemp(join(tmpdir(), 'wcpos-sqlite-probe-'));
const pageEntry = `
import { getRxStorageWorker } from 'rxdb-premium/plugins/storage-worker';
import { fillWithDefaultSettings } from 'rxdb/plugins/core';
import { SQLITE_POOL_DIRECTORY, SQLITE_POOL_INITIAL_CAPACITY } from './packages/database/src/adapters/storage/sqlite-pool.ts';
import { measureAppStorage } from './packages/database/src/measure-storage.web.ts';
const storage = getRxStorageWorker({
  workerInput: () => {
    const worker = new Worker('/sqlite.worker.js?ver=probe', { type: 'module' });
    for (const type of ['error', 'messageerror']) worker.addEventListener(type, () => { globalThis.probeError = 'worker ' + type; });
    return worker;
  }, mode: 'one', workerOptions: { type: 'module' },
});
const params = {
  databaseInstanceToken: 'probe-token', databaseName: 'release-probe', collectionName: 'docs',
  schema: fillWithDefaultSettings({ version: 0, primaryKey: 'id', type: 'object',
    properties: { id: { type: 'string', maxLength: 100 }, n: { type: 'number' } }, required: ['id', 'n'] }),
  options: {}, multiInstance: false, devMode: true,
};
(async () => {
  let instance = await storage.createStorageInstance(params);
  if (!location.search) {
    const written = await instance.bulkWrite([{ document: { id: 'a', n: 42, _deleted: false,
      _attachments: {}, _rev: '1-a', _meta: { lwt: Date.now() } } }], 'probe');
    if (written.error.length) throw new Error(JSON.stringify(written.error));
  }
  const read = async () => {
    const rows = await instance.findDocumentsById(['a'], false);
    if (rows.length !== 1 || rows[0].n !== 42) throw new Error('persisted row missing');
  };
  await read();
  await instance.close();
  instance = await storage.createStorageInstance(params);
  await read();
  await instance.close();
  // Keep every pair open: initialCapacity must not remain a hard ceiling.
  const instances = [];
  for (let i = 0; i <= SQLITE_POOL_INITIAL_CAPACITY / 2; i++) {
    const extra = await storage.createStorageInstance({ ...params, databaseName: 'growth-' + i });
    instances.push(extra);
  }
  const last = instances.at(-1);
  const rows = await last.findDocumentsById(['growth'], false);
  if (!rows.length) await last.bulkWrite([{ document: { id: 'growth', n: 99, _deleted: false,
    _attachments: {}, _rev: '1-growth', _meta: { lwt: Date.now() } } }], 'growth-probe');
  if ((await last.findDocumentsById(['growth'], false))[0]?.n !== 99) throw new Error('growth read failed');
  // Measure from the PAGE while the worker owns the pool's sync access handles.
  const pool = await (await navigator.storage.getDirectory()).getDirectoryHandle(SQLITE_POOL_DIRECTORY);
  let files = 0, bytes = 0;
  const errors = [];
  async function walk(directory) {
    for await (const entry of directory.values()) {
      if (entry.kind === 'directory') await walk(entry);
      else {
        files++;
        try { bytes += (await entry.getFile()).size; }
        catch (error) { errors.push({ name: error.name, message: error.message }); }
      }
    }
  }
  await walk(pool);
  globalThis.probeMeasurement = { files, bytes, errors, footprint: await measureAppStorage() };
  await Promise.all(instances.map(instance => instance.close()));
  globalThis.probeResult = 'PASS write/read/close/reopen; growth beyond initial capacity';
})().catch((error) => { globalThis.probeError = error.message; });
`;
let browser;
const publicDir = new URL('../apps/main/public/', import.meta.url);
const server = createServer(async (request, response) => {
	const url = new URL(request.url, 'http://localhost');
	try {
		if (url.pathname === '/') {
			response.setHeader('Content-Type', 'text/html');
			response.end('<!doctype html><script type="module" src="/probe.js"></script>');
		} else if (['/probe.js', '/sqlite.worker.js', '/sqlite3.wasm'].includes(url.pathname)) {
			response.setHeader(
				'Content-Type',
				url.pathname.endsWith('.wasm') ? 'application/wasm' : 'text/javascript'
			);
			const file =
				url.pathname === '/probe.js'
					? join(dir, 'probe.js')
					: new URL(url.pathname.slice(1), publicDir);
			response.end(await readFile(file));
		} else {
			response.writeHead(404).end();
		}
	} catch (error) {
		response.writeHead(500).end(String(error));
	}
});
try {
	await build({
		stdin: { contents: pageEntry, resolveDir: process.cwd() },
		outfile: join(dir, 'probe.js'),
		bundle: true,
		format: 'esm',
		platform: 'browser',
	});
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	const origin = `http://127.0.0.1:${server.address().port}`;
	browser = await chromium.launch();
	console.log('Chromium:', browser.version());
	const context = await browser.newContext();
	const page = await context.newPage();
	const pageErrors = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));
	const requests = [];
	context.on('request', (request) => requests.push(request.url()));
	const run = async (suffix) => {
		await page.goto(origin + suffix);
		await page.waitForFunction(() => globalThis.probeResult || globalThis.probeError, undefined, {
			timeout: 30000,
		});
		const result = await page.evaluate(() => ({
			result: globalThis.probeResult,
			error: globalThis.probeError,
			measurement: globalThis.probeMeasurement,
		}));
		assert.equal(result.error, undefined);
		assert.deepEqual(pageErrors, []);
		console.log('Live pool measurement:', JSON.stringify(result.measurement));
		assert.ok(result.measurement.files > 0, 'worker has pool files');
		assert.deepEqual(result.measurement.errors, [], 'page getFile succeeds with live pool handles');
		const sqliteRoot = result.measurement.footprint.entries.find(
			(entry) => entry.root === 'sqlite'
		);
		assert.ok(sqliteRoot?.bytes > 0, 'live sqlite root has non-zero bytes');
		assert.equal(
			sqliteRoot.bytes,
			result.measurement.bytes,
			'footprint matches the page directory walk'
		);
		console.log(result.result + suffix);
	};
	await run('/');
	await run('/?read=persisted');
	assert.ok(
		requests.includes(origin + '/sqlite3.wasm?ver=probe'),
		'wasm inherits worker cache-buster'
	);
	console.log('PASS persistence across page/worker restart; wasm cache-buster');
	// Exercise the suite's actual recursive helpers while no worker holds handles.
	await page.goto(origin + '/empty');
	const source = await readFile(
		new URL('../apps/main/e2e/opfs-helpers.ts', import.meta.url),
		'utf8'
	);
	const { code } = await transform(source, { loader: 'ts', format: 'esm' });
	const { exportOPFS, restoreOPFS } = await import(
		'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
	);
	const snapshot = await exportOPFS(page);
	assert.ok(Object.keys(snapshot).some((path) => path.startsWith('.wcpos-sqlite/')));
	await restoreOPFS(page, snapshot);
	assert.deepEqual(await exportOPFS(page), snapshot);
	await run('/?read=restored');
	console.log('PASS OPFS snapshot/restore preserves readable SQLite pool');
} finally {
	await browser?.close();
	await new Promise((resolve) => server.close(resolve));
	await rm(dir, { recursive: true, force: true });
}
