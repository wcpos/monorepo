import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
	isTransientStatus,
	STORE_TRANSIENT_ATTEMPTS,
	TransientStoreError,
	withStoreRetry,
} from './store-transient-retry.mjs';

const harness = () => {
	const sleeps = [];
	const warnings = [];
	return {
		sleeps,
		warnings,
		options: {
			delayMs: 7,
			sleep: async (ms) => {
				sleeps.push(ms);
			},
			warn: (line) => warnings.push(line),
		},
	};
};

test('a read that succeeds first time never sleeps or warns', async () => {
	const h = harness();
	const value = await withStoreRetry('probe', async () => 'ok', h.options);
	assert.equal(value, 'ok');
	assert.deepEqual(h.sleeps, []);
	assert.deepEqual(h.warnings, []);
});

test('a transient failure is retried after the delay and the eventual value is returned', async () => {
	const h = harness();
	let calls = 0;
	const value = await withStoreRetry(
		'login page',
		async () => {
			calls += 1;
			if (calls < 3) throw new TransientStoreError(`HTTP 200 title="Error" bytes=154`);
			return { nonce: 'n', session: 's' };
		},
		h.options
	);
	assert.deepEqual(value, { nonce: 'n', session: 's' });
	assert.equal(calls, 3);
	assert.deepEqual(h.sleeps, [7, 7]);
	assert.equal(h.warnings.length, 2);
	assert.match(
		h.warnings[0],
		/login page: HTTP 200 title="Error" bytes=154 — retrying in 0.007s \(attempt 1 of 6\)/
	);
});

test("node fetch's network failure (TypeError with a cause) counts as transient", async () => {
	const h = harness();
	let calls = 0;
	const value = await withStoreRetry(
		'reachability',
		async () => {
			calls += 1;
			if (calls === 1) throw new TypeError('fetch failed', { cause: new Error('ECONNRESET') });
			return 'reachable';
		},
		h.options
	);
	assert.equal(value, 'reachable');
	assert.deepEqual(h.sleeps, [7]);
});

test('a non-transient error propagates at once, untouched, with no retry', async () => {
	const h = harness();
	let calls = 0;
	const boom = new Error('bad credentials');
	await assert.rejects(
		withStoreRetry(
			'auth',
			async () => {
				calls += 1;
				throw boom;
			},
			h.options
		),
		(err) => err === boom
	);
	assert.equal(calls, 1);
	assert.deepEqual(h.sleeps, []);
	assert.deepEqual(h.warnings, []);
});

test('the budget is bounded: the last transient error propagates after attempts − 1 sleeps', async () => {
	const h = harness();
	let calls = 0;
	await assert.rejects(
		withStoreRetry(
			'store',
			async () => {
				calls += 1;
				throw new TransientStoreError(`HTTP 503 (call ${calls})`);
			},
			h.options
		),
		(err) =>
			err instanceof TransientStoreError &&
			err.message === `HTTP 503 (call ${STORE_TRANSIENT_ATTEMPTS})`
	);
	assert.equal(calls, STORE_TRANSIENT_ATTEMPTS);
	assert.equal(h.sleeps.length, STORE_TRANSIENT_ATTEMPTS - 1);
	assert.equal(h.warnings.length, STORE_TRANSIENT_ATTEMPTS - 1);
});

test('only saturation statuses are transient — auth and routing failures are not', () => {
	for (const status of [429, 500, 502, 503, 504])
		assert.equal(isTransientStatus(status), true, `${status}`);
	for (const status of [200, 301, 400, 401, 403, 404])
		assert.equal(isTransientStatus(status), false, `${status}`);
});
