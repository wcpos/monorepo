// Real two-page origin ownership + shipped worker. No app/provider mocks in the protocol.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

import { build } from 'esbuild';
import { chromium } from 'playwright';

const { outputFiles } = await build({
	stdin: {
		resolveDir: process.cwd(),
		contents: `
import { createLiveTab, holdLiveTab } from './packages/database/src/live-tab/live-tab.web';
import { getRxStorageWorker } from 'rxdb-premium/plugins/storage-worker';
import { fillWithDefaultSettings } from 'rxdb/plugins/core';
let worker, storage, instance;
globalThis.opens = 0;
globalThis.hold = holdLiveTab;
globalThis.tab = createLiveTab({
 locks: navigator.locks, channel: name => new BroadcastChannel(name),
 onUnavailable: () => { throw new Error('Missing real Web Locks'); },
 onError: error => { globalThis.probeError = String(error); },
 onHandover: async () => { await globalThis.opened; await instance?.close(); worker?.terminate(); storage = undefined; },
});
tab.state$.subscribe(state => {
 globalThis.state = state;
 if (state.kind !== 'live') return;
 globalThis.opened = (async () => {
  storage = getRxStorageWorker({ workerInput: () => {
   globalThis.opens++; worker = new Worker('/sqlite.worker.js', { type: 'module' });
   worker.addEventListener('error', e => { globalThis.probeError = e.message; }); return worker;
  }, mode: 'one', workerOptions: { type: 'module' } });
  instance = await storage.createStorageInstance({ databaseInstanceToken: crypto.randomUUID(),
   databaseName: 'live-probe', collectionName: 'docs',
   schema: fillWithDefaultSettings({ version: 0, primaryKey: 'id', type: 'object',
    properties: { id: { type: 'string', maxLength: 100 } }, required: ['id'] }),
   options: {}, multiInstance: false, devMode: true });
  await instance.findDocumentsById(['probe'], false); globalThis.ready = true;
 })().catch(error => { globalThis.probeError = String(error); });
});`,
	},
	bundle: true,
	format: 'esm',
	platform: 'browser',
	write: false,
});
const server = createServer(async (request, response) => {
	try {
		if (request.url === '/')
			response.end('<!doctype html><script type="module" src="/probe.js"></script>');
		else if (request.url === '/probe.js') {
			response.setHeader('Content-Type', 'text/javascript');
			response.end(outputFiles[0].contents);
		} else if (['/sqlite.worker.js', '/sqlite3.wasm'].includes(request.url)) {
			response.setHeader(
				'Content-Type',
				request.url.endsWith('.wasm') ? 'application/wasm' : 'text/javascript'
			);
			response.end(await readFile(new URL('../apps/main/public' + request.url, import.meta.url)));
		} else response.writeHead(404).end();
	} catch (error) {
		response.writeHead(500).end(String(error));
	}
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch();
try {
	const context = await browser.newContext();
	const origin = `http://127.0.0.1:${server.address().port}`;
	const errors = [];
	context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)));
	const a = await context.newPage();
	await a.goto(origin);
	await a.waitForFunction(() => globalThis.ready || globalThis.probeError);
	assert.equal(await a.evaluate(() => globalThis.probeError), undefined);
	const b = await context.newPage();
	await b.goto(origin);
	await b.waitForFunction(() => globalThis.state?.kind === 'parked');
	assert.equal(await b.evaluate(() => globalThis.opens), 0);
	console.log('PASS first tab live; second parked with zero worker/pool opens');
	await a.evaluate(() => {
		globalThis.release = globalThis.hold('payment');
	});
	await b.evaluate(() => globalThis.tab.takeOver());
	await b.waitForFunction(() => globalThis.state?.deferral === 'payment');
	await a.evaluate(() => globalThis.release());
	await b.waitForFunction(() => globalThis.ready || globalThis.probeError);
	assert.equal(await b.evaluate(() => globalThis.probeError), undefined);
	assert.equal(await a.evaluate(() => globalThis.state.kind), 'parked');
	console.log('PASS payment deferral, close/terminate/release, requester opens real pool');
	// A former pool owner must reload its cached premium client, as the app gate does.
	await a.reload();
	await a.waitForFunction(() => globalThis.state?.kind === 'parked');
	await b.evaluate(() => {
		globalThis.hold('write');
	});
	await a.evaluate(() => {
		globalThis.ready = false;
		globalThis.tab.takeOver();
	});
	await a.waitForFunction(() => globalThis.state?.deferral === 'write');
	await a.waitForFunction(() => globalThis.ready || globalThis.probeError, undefined, {
		timeout: 30_000,
	});
	assert.equal(await a.evaluate(() => globalThis.probeError), undefined);
	console.log('PASS write deferral reaches ceiling; reverse takeover opens real pool');
	await b.reload();
	await b.waitForFunction(() => globalThis.state?.kind === 'parked');
	const cdp = await context.newCDPSession(a);
	await cdp.send('Emulation.setScriptExecutionDisabled', { value: true });
	await b.evaluate(() => {
		globalThis.ready = false;
		globalThis.tab.takeOver();
	});
	await b.waitForFunction(() => globalThis.state?.deferral === 'no-answer');
	await a.close();
	await b.waitForFunction(() => globalThis.ready || globalThis.probeError);
	assert.equal(await b.evaluate(() => globalThis.probeError), undefined);
	assert.deepEqual(errors, []);
	console.log('PASS no-answer timeout; closing frozen holder grants ownership; no pool contention');
} finally {
	await browser.close();
	await new Promise((resolve) => server.close(resolve));
}
