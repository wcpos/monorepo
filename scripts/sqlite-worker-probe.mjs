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
    const conflict = await instance.bulkWrite([{ document: { id: 'a', n: 42, _deleted: false,
      _attachments: {}, _rev: '1-b', _meta: { lwt: Date.now() } } }], 'probe');
    if (conflict.error.length !== 1 || conflict.error[0].status !== 409) throw new Error(JSON.stringify(conflict.error));
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
// Probe-only worker build with the pool cap lowered to one partial growth step (#2242).
const CAPPED_POOL = 30;
const capEntry = `
import { getRxStorageWorker } from 'rxdb-premium/plugins/storage-worker';
import { fillWithDefaultSettings } from 'rxdb/plugins/core';
const storage = getRxStorageWorker({
  workerInput: () => new Worker('/sqlite-capped.worker.js?ver=probe', { type: 'module' }),
  mode: 'one', workerOptions: { type: 'module' },
});
const schema = fillWithDefaultSettings({ version: 0, primaryKey: 'id', type: 'object',
  properties: { id: { type: 'string', maxLength: 100 } }, required: ['id'] });
(async () => {
  const instances = [];
  try {
    for (let i = 0; i < 64; i++) {
      const instance = await storage.createStorageInstance({ databaseInstanceToken: 'cap-token',
        databaseName: 'cap-' + i, collectionName: 'docs', schema, options: {}, multiInstance: false,
        devMode: true });
      // Premium opens lazily: a read opens each database in turn.
      await instance.findDocumentsById(['none'], false);
      instances.push(instance);
    }
    globalThis.probeError = 'pool never refused 64 databases';
  } catch (error) {
    globalThis.probeResult = { opened: instances.length, message: String(error?.message ?? error) };
  }
  await Promise.all(instances.map((instance) => instance.close()));
})().catch((error) => { globalThis.probeError = error.message; });
`;
// All opens start together: the pool must grow and refuse by reservation, not by race (#2347).
const burstEntry = `
import { getRxStorageWorker } from 'rxdb-premium/plugins/storage-worker';
import { fillWithDefaultSettings } from 'rxdb/plugins/core';
import { SQLITE_POOL_DIRECTORY } from './packages/database/src/adapters/storage/sqlite-pool.ts';
const storage = getRxStorageWorker({
  workerInput: () => new Worker('/sqlite-capped.worker.js?ver=probe', { type: 'module' }),
  mode: 'one', workerOptions: { type: 'module' },
});
const schema = fillWithDefaultSettings({ version: 0, primaryKey: 'id', type: 'object',
  properties: { id: { type: 'string', maxLength: 100 } }, required: ['id'] });
const count = Number(new URLSearchParams(location.search).get('n'));
(async () => {
  const results = await Promise.allSettled(Array.from({ length: count }, async (_, i) => {
    const instance = await storage.createStorageInstance({ databaseInstanceToken: 'burst-token',
      databaseName: 'burst-' + i, collectionName: 'docs', schema, options: {}, multiInstance: false,
      devMode: true });
    await instance.findDocumentsById(['none'], false);
    return instance;
  }));
  const pool = await (await navigator.storage.getDirectory()).getDirectoryHandle(SQLITE_POOL_DIRECTORY);
  let files = 0;
  async function walk(directory) {
    for await (const entry of directory.values()) entry.kind === 'directory' ? await walk(entry) : files++;
  }
  await walk(pool);
  const opened = results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
  const errors = results.filter((result) => result.reason).map((result) => String(result.reason?.message ?? result.reason));
  globalThis.probeResult = { opened: opened.length, errors, files };
  await Promise.all(opened.map((instance) => instance.close()));
})().catch((error) => { globalThis.probeError = error.message; });
`;
const lowerPoolCap = {
	name: 'lower-pool-cap',
	setup(pluginBuild) {
		pluginBuild.onLoad({ filter: /sqlite-pool\.ts$/ }, async ({ path }) => {
			const source = await readFile(path, 'utf8');
			const capped = source.replace(
				/export const SQLITE_POOL_MAX_CAPACITY =[^;]+;/,
				`export const SQLITE_POOL_MAX_CAPACITY = ${CAPPED_POOL};`
			);
			assert.notEqual(capped, source, 'probe must lower SQLITE_POOL_MAX_CAPACITY');
			return { contents: capped, loader: 'ts' };
		});
	},
};
let browser;
const publicDir = new URL('../apps/main/public/', import.meta.url);
const server = createServer(async (request, response) => {
	const url = new URL(request.url, 'http://localhost');
	try {
		const probeFiles = [
			'/probe.js',
			'/cap-probe.js',
			'/burst-probe.js',
			'/sqlite-capped.worker.js',
		];
		if (['/', '/cap', '/burst'].includes(url.pathname)) {
			response.setHeader('Content-Type', 'text/html');
			const script = url.pathname === '/' ? '/probe.js' : url.pathname + '-probe.js';
			response.end(`<!doctype html><script type="module" src="${script}"></script>`);
		} else if ([...probeFiles, '/sqlite.worker.js', '/sqlite3.wasm'].includes(url.pathname)) {
			response.setHeader(
				'Content-Type',
				url.pathname.endsWith('.wasm') ? 'application/wasm' : 'text/javascript'
			);
			const file = probeFiles.includes(url.pathname)
				? join(dir, url.pathname.slice(1))
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
	await build({
		stdin: { contents: capEntry, resolveDir: process.cwd() },
		outfile: join(dir, 'cap-probe.js'),
		bundle: true,
		format: 'esm',
		platform: 'browser',
	});
	await build({
		stdin: { contents: burstEntry, resolveDir: process.cwd() },
		outfile: join(dir, 'burst-probe.js'),
		bundle: true,
		format: 'esm',
		platform: 'browser',
	});
	await build({
		entryPoints: [new URL('./sqlite-worker-entry.mjs', import.meta.url).pathname],
		outfile: join(dir, 'sqlite-capped.worker.js'),
		bundle: true,
		format: 'esm',
		platform: 'browser',
		plugins: [lowerPoolCap],
	});
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	const origin = `http://127.0.0.1:${server.address().port}`;
	browser = await chromium.launch();
	console.log('Chromium:', browser.version());
	const context = await browser.newContext();
	const page = await context.newPage();
	const stepWarnings = [];
	page.on('console', (message) => {
		if (message.text().includes('sqlite3_step()')) stepWarnings.push(message.text());
	});
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
	assert.deepEqual(
		stepWarnings,
		[],
		'recovered INSERT constraint failures must not reach the console (#2334)'
	);
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
	// Fresh context: an empty pool grows to the lowered cap, then refuses by name.
	const capContext = await browser.newContext();
	const capPage = await capContext.newPage();
	await capPage.goto(origin + '/cap');
	await capPage.waitForFunction(() => globalThis.probeResult || globalThis.probeError, undefined, {
		timeout: 30000,
	});
	const capped = await capPage.evaluate(() => ({
		result: globalThis.probeResult,
		error: globalThis.probeError,
	}));
	console.log('Capped pool refusal:', JSON.stringify(capped));
	assert.equal(capped.error, undefined);
	assert.equal(capped.result.opened, CAPPED_POOL / 2, 'every slot under the cap is usable');
	assert.match(capped.result.message, /SqlitePoolFullError/);
	await capContext.close();
	console.log(`PASS pool refuses past a lowered cap of ${CAPPED_POOL} with SqlitePoolFullError`);
	// Fresh context per burst; every open starts at once against the capped worker.
	const burst = async (count) => {
		const burstContext = await browser.newContext();
		const burstPage = await burstContext.newPage();
		await burstPage.goto(origin + '/burst?n=' + count);
		await burstPage.waitForFunction(
			() => globalThis.probeResult || globalThis.probeError,
			undefined,
			{
				timeout: 30000,
			}
		);
		const outcome = await burstPage.evaluate(() => ({
			result: globalThis.probeResult,
			error: globalThis.probeError,
		}));
		await burstContext.close();
		console.log(`Concurrent burst of ${count}:`, JSON.stringify(outcome));
		assert.equal(outcome.error, undefined);
		return outcome.result;
	};
	// 12 databases need 24 files against an initial capacity of 22.
	const grown = await burst(12);
	assert.equal(grown.opened, 12, 'every concurrent open gets a slot once the pool grows');
	console.log('PASS concurrent opens grow the pool');
	const refused = await burst(20);
	assert.equal(refused.opened, CAPPED_POOL / 2, 'every slot under the cap is usable');
	assert.equal(refused.errors.length, 20 - CAPPED_POOL / 2);
	for (const message of refused.errors) {
		assert.match(message, /SqlitePoolFullError/);
		assert.doesNotMatch(message, /SQLITE_CANTOPEN/);
	}
	// The directory holds one file per slot and no others (measured: 22, 30 and 54 files at
	// those capacities), so its file count is the capacity.
	assert.ok(refused.files <= CAPPED_POOL, `pool directory holds ${refused.files} files`);
	console.log(`PASS concurrent opens past a cap of ${CAPPED_POOL} get SqlitePoolFullError`);
} finally {
	await browser?.close();
	await new Promise((resolve) => server.close(resolve));
	await rm(dir, { recursive: true, force: true });
}
