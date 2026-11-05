import assert from 'node:assert/strict';
import { test } from 'node:test';

import { run } from './cli.mjs';
import { ALL, CREATE, CREDS, fakeStore, MARKER, noSleep, THROUGH } from './fake-store.mjs';

async function cli(store, logs = []) {
	const argv = [
		'apply',
		'--target',
		'demo',
		'--credentials-cmd',
		'/unused',
		'--yes',
		'--through',
		THROUGH.toISOString(),
	];
	return {
		code: await run(argv, {
			fetchImpl: store.fetchImpl,
			sleep: noSleep,
			log: (l) => logs.push(l),
			readCredentials: async () => CREDS,
		}),
		logs,
	};
}

test('stock moving on the first completion is a safety stop, and no second order is created', async () => {
	const store = fakeStore({ reduceStockOnComplete: true });
	const { code, logs } = await cli(store);
	assert.equal(code, 2);
	assert.equal(store.creates().length, 1);
	assert.ok(logs.some((l) => l.startsWith('stopped: ') && l.includes('stock')));
});

test('a 500 on a write stops the run and prints no body text', async () => {
	const store = fakeStore({ failWhen: (r) => r.method === 'POST' && r.path === CREATE });
	const { code, logs } = await cli(store);
	assert.equal(code, 1);
	assert.equal(store.creates().length, 1);
	assert.ok(logs.some((l) => l.includes('500') && l.includes('internal_server_error')));
	for (const line of logs)
		assert.ok(!line.includes(MARKER) && !line.includes('@example.com'), line);
});

test('no request in any check used DELETE or sent force', () => {
	assert.ok(ALL.length > 0);
	for (const r of ALL) assert.ok(r.method !== 'DELETE' && !/force/i.test(r.query + r.raw), r.path);
});
