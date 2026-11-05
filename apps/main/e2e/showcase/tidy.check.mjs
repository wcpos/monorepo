import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { SeedSafetyError } from './apply.mjs';
import { run } from './cli.mjs';
import { createClient } from './client.mjs';
import { SEED_META_KEY, TARGETS } from './targets.mjs';
import { runTidy, TIDY_MIN_SEED_ORDERS } from './tidy.mjs';

const CREDS = { username: 'seed-admin', password: 'pw-Zq81-secret' };
const MARKER = 'BODY-MARKER-4412';
const NOW = new Date('2026-11-05T03:00:00Z');
/** NOW less the grace, as the store writes a GMT date. */
const GRACE_EDGE = '2026-11-05T02:00:00';
const AFTER_BASELINE = '2026-11-04T22:00:00';
const IN_WINDOW = '2026-10-20T12:00:00';
const ALL = [];
const target = TARGETS.demo;
const noSleep = async () => {};

const order = (id, created, extra = {}) => ({
	id,
	status: 'completed',
	date_created_gmt: created,
	meta_data: [{ key: '_pos_user', value: '4' }],
	billing: { first_name: 'Maya', email: 'maya.thompson@example.com' },
	...extra,
});
const product = (id, created, more = {}) => ({
	id,
	status: 'publish',
	date_created_gmt: created,
	...more,
});
/** Seed orders on both sides of the baseline, so the seed count is real either way. */
const seedOrders = (n = 120) =>
	Array.from({ length: n }, (_, i) =>
		order(i + 1, i % 2 ? AFTER_BASELINE : IN_WINDOW, {
			meta_data: [{ key: SEED_META_KEY, value: `us-20261020-${i}` }],
		})
	);

/** An in-memory store answering the routes the tidy uses, loosely as WooCommerce would. */
function fakeStore({ orders = [], products = [], seed = 120, fail = () => null } = {}) {
	const s = { requests: [], orders: [...seedOrders(seed), ...orders], products };
	const gmt = (value) => Date.parse(`${value}Z`);
	const listed = (rows, q) =>
		rows
			// a date that does not parse is listed, so the tidy's own guard meets it
			.filter((r) => !q.has('after') || !(gmt(r.date_created_gmt) <= gmt(q.get('after'))))
			.slice((q.get('page') - 1) * q.get('per_page'))
			.slice(0, q.get('per_page'));
	const reply = (status, body) =>
		new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
	s.fetchImpl = async (href, init = {}) => {
		const u = new URL(href);
		const request = { method: init.method ?? 'GET', path: u.pathname, query: u.search };
		request.raw = init.body ?? '';
		s.requests.push(request);
		ALL.push(request);
		const [, kind, id] =
			u.pathname.match(/^\/wp-json\/wc\/v3\/(orders|products)(?:\/(\d+))?$/) ?? [];
		const failure = fail(request);
		if (failure)
			return reply(failure.status, { code: failure.code, message: `${MARKER} maya@example.com` });
		if (!kind) return reply(404, { code: 'rest_no_route' });
		if (request.method === 'GET' && !id) return reply(200, listed(s[kind], u.searchParams));
		const row = s[kind].find((r) => r.id === Number(id));
		if (request.method !== 'DELETE' || !row) return reply(404, { code: 'rest_no_route' });
		if (row.status === 'trash') return reply(410, { code: 'woocommerce_rest_already_trashed' });
		row.status = 'trash';
		return reply(200, row);
	};
	s.deletes = () => s.requests.filter((r) => r.method === 'DELETE');
	s.trashed = (kind) =>
		s
			.deletes()
			.filter((r) => r.path.includes(`/${kind}/`))
			.map((r) => Number(r.path.split('/').pop()));
	return s;
}

async function tidy(store, { tgt = target, write = true, firstRun = false } = {}) {
	const [logs, recorded] = [[], []];
	const log = (line) => logs.push(String(line));
	const client = createClient({
		url: tgt.url,
		credentials: CREDS,
		fetchImpl: store.fetchImpl,
		sleep: noSleep,
		log,
	});
	const options = { write, firstRun, now: NOW, record: (r) => recorded.push(r), log };
	return runTidy(client, tgt, options).then(
		(r) => ({ ...r, logs, recorded }),
		(error) => ({ error, logs, recorded })
	);
}

test('a non-seed order after the baseline is trashed; a seed order after the baseline is not', async () => {
	const store = fakeStore({ orders: [order(1001, AFTER_BASELINE)] });
	const { counts, recorded, error } = await tidy(store);
	assert.equal(error, undefined);
	assert.deepEqual(store.trashed('orders'), [1001]);
	assert.deepEqual(recorded, [{ type: 'order', id: 1001 }]);
	assert.equal(counts.orders.seed, 120);
	assert.equal(store.orders.find((o) => o.id === 2).status, 'completed');
});

test('a non-seed order in the window before the baseline stays nightly and goes on the first run', async () => {
	const rows = () => [order(1001, IN_WINDOW), order(1002, AFTER_BASELINE)];
	const nightly = fakeStore({ orders: rows() });
	assert.equal((await tidy(nightly)).error, undefined);
	assert.deepEqual(nightly.trashed('orders'), [1002]);
	const first = fakeStore({ orders: rows() });
	assert.equal((await tidy(first, { firstRun: true })).error, undefined);
	assert.deepEqual(first.trashed('orders'), [1001, 1002]);
});

test('a non-seed order before the window is untouched in both modes', async () => {
	for (const firstRun of [false, true]) {
		const store = fakeStore({
			orders: [order(1001, '2026-10-01T12:00:00'), order(1002, AFTER_BASELINE)],
		});
		const { counts, error } = await tidy(store, { firstRun });
		assert.equal(error, undefined);
		assert.deepEqual(store.trashed('orders'), [1002]);
		assert.equal(counts.orders.listed, 121);
		assert.equal(store.orders.find((o) => o.id === 1001).status, 'completed');
	}
});

test('a product after the baseline is trashed in both modes; a product before it is not', async () => {
	for (const firstRun of [false, true]) {
		const store = fakeStore({
			products: [product(71, '2026-11-01T00:00:00'), product(72, AFTER_BASELINE)],
		});
		const { counts, recorded, error } = await tidy(store, { firstRun });
		assert.equal(error, undefined);
		assert.deepEqual(store.trashed('products'), [72]);
		assert.deepEqual(recorded, [{ type: 'product', id: 72 }]);
		assert.equal(counts.products.listed, 1);
		assert.equal(store.products[0].status, 'publish');
	}
});

test('an order or product younger than the grace stays; one exactly at the grace is trashed', async () => {
	const young = '2026-11-05T02:00:01';
	const store = fakeStore({
		orders: [order(1001, GRACE_EDGE), order(1002, young)],
		products: [product(71, GRACE_EDGE), product(72, young)],
	});
	const { counts, error } = await tidy(store);
	assert.equal(error, undefined);
	assert.deepEqual(store.trashed('orders'), [1001]);
	assert.deepEqual(store.trashed('products'), [71]);
	assert.equal(counts.orders.inGrace + counts.products.inGrace, 2);
});

test('a row already in trash gets no request', async () => {
	const store = fakeStore({
		orders: [order(1001, AFTER_BASELINE, { status: 'trash' }), order(1002, AFTER_BASELINE)],
		products: [product(71, AFTER_BASELINE, { status: 'trash' })],
	});
	const { counts, error } = await tidy(store);
	assert.equal(error, undefined);
	assert.deepEqual(store.trashed('orders'), [1002]);
	assert.deepEqual(store.trashed('products'), []);
	assert.equal(counts.orders.alreadyTrash + counts.products.alreadyTrash, 2);
	assert.ok(!store.requests.some((r) => /\/(1001|71)$/.test(r.path)));
});

test('client.trash refuses anything but one order or one product, before any request', async () => {
	const store = fakeStore();
	const client = createClient({
		url: target.url,
		credentials: CREDS,
		fetchImpl: store.fetchImpl,
		sleep: noSleep,
	});
	for (const path of [
		'/wp-json/wc/v3/customers/1',
		'/wp-json/wc/v3/coupons/1',
		'/wp-json/wc/v3/orders/1?force=true',
		'/wp-json/wc/v3/orders',
		'/wp-json/wc/v3/orders/1/notes/2',
	])
		await assert.rejects(client.trash(path), /refusing/, path);
	assert.equal(store.requests.length, 0);
	assert.equal(client.stats.writes, 0);
	await client.trash('/wp-json/wc/v3/orders/1');
	assert.equal(store.orders[0].status, 'trash');
});

test('a null baseline is a safety stop with no write', async () => {
	const store = fakeStore({ orders: [order(1001, AFTER_BASELINE)] });
	const { error } = await tidy(store, { tgt: TARGETS['dev-free'] });
	assert.ok(error instanceof SeedSafetyError);
	assert.equal(store.requests.length, 0);
	assert.equal(store.orders.find((o) => o.id === 1001).status, 'completed');
});

test('an order row with no meta_data, or a date that does not parse, is a safety stop with no write', async () => {
	const broken = [
		{
			orders: [order(1001, AFTER_BASELINE), order(1002, AFTER_BASELINE, { meta_data: undefined })],
		},
		{ orders: [order(1001, AFTER_BASELINE), order(1002, 'yesterday')] },
		{ orders: [order(1001, AFTER_BASELINE)], products: [product(71, null)] },
	];
	for (const rows of broken) {
		const store = fakeStore(rows);
		const { error } = await tidy(store);
		assert.ok(error instanceof SeedSafetyError, error?.message);
		assert.equal(store.deletes().length, 0);
		assert.equal(store.orders.find((o) => o.id === 1001).status, 'completed');
	}
});

test('fewer seed orders than the floor is a safety stop with no write', async () => {
	const store = fakeStore({
		seed: TIDY_MIN_SEED_ORDERS - 1,
		orders: [order(1001, AFTER_BASELINE)],
	});
	const { error } = await tidy(store);
	assert.ok(error instanceof SeedSafetyError);
	assert.equal(store.deletes().length, 0);
	const enough = fakeStore({ seed: TIDY_MIN_SEED_ORDERS, orders: [order(1001, AFTER_BASELINE)] });
	assert.equal((await tidy(enough)).error, undefined);
	assert.deepEqual(enough.trashed('orders'), [1001]);
});

test('over the nightly cap is a safety stop with no write; the first run passes under its own cap', async () => {
	const rows = () => Array.from({ length: 501 }, (_, i) => order(1001 + i, AFTER_BASELINE));
	const nightly = fakeStore({ orders: rows() });
	assert.ok((await tidy(nightly)).error instanceof SeedSafetyError);
	assert.equal(nightly.deletes().length, 0);
	const first = fakeStore({ orders: rows() });
	const { counts, error } = await tidy(first, { firstRun: true });
	assert.equal(error, undefined);
	assert.equal(counts.orders.trashed, 501);
});

test('write: false sends no DELETE and finds the same rows a write run trashes', async () => {
	const rows = () => ({
		orders: [order(1001, AFTER_BASELINE), order(1002, IN_WINDOW)],
		products: [product(71, AFTER_BASELINE)],
	});
	const dry = fakeStore(rows());
	const planned = await tidy(dry, { write: false, firstRun: true });
	assert.equal(dry.deletes().length, 0);
	assert.deepEqual(planned.recorded, []);
	const wet = fakeStore(rows());
	const done = await tidy(wet, { firstRun: true });
	for (const kind of ['orders', 'products']) {
		assert.equal(planned.counts[kind].toTrash, done.counts[kind].toTrash);
		assert.equal(done.counts[kind].trashed, wet.trashed(kind).length);
	}
	assert.equal(planned.counts.orders.toTrash + planned.counts.products.toTrash, 3);
});

test('a 410 already-trashed counts as gone and the run goes on; a 500 stops it with the counts so far', async () => {
	const fail = (r) =>
		r.method !== 'DELETE'
			? null
			: r.path.endsWith('/1001')
				? { status: 410, code: 'woocommerce_rest_already_trashed' }
				: r.path.endsWith('/1003')
					? { status: 500, code: 'internal_server_error' }
					: null;
	const ids = [1001, 1002, 1003, 1004];
	const store = fakeStore({ orders: ids.map((id) => order(id, AFTER_BASELINE)), fail });
	const { error, recorded, logs } = await tidy(store);
	assert.equal(error?.status, 500);
	assert.equal(error.counts.orders.alreadyGone, 1);
	assert.equal(error.counts.orders.trashed, 1);
	assert.deepEqual(recorded, [{ type: 'order', id: 1002 }]);
	assert.deepEqual(store.trashed('orders'), [1001, 1002, 1003]);
	assert.equal(store.orders.find((o) => o.id === 1004).status, 'completed');
	for (const line of [...logs, error.message])
		assert.ok(!line.includes(MARKER) && !line.includes('@example.com'), line);
});

test('the tidy command: --yes needs --record, a null baseline stops, and --record lists what moved', async () => {
	const cli = async (store, args) => {
		const logs = [];
		const deps = { fetchImpl: store.fetchImpl, sleep: noSleep, now: () => NOW };
		deps.log = (l) => logs.push(l);
		deps.readCredentials = async () => CREDS;
		return { code: await run(['tidy', '--credentials-cmd', '/unused', ...args], deps), logs };
	};
	const rows = () => ({
		orders: [order(1001, AFTER_BASELINE)],
		products: [product(71, GRACE_EDGE)],
	});
	const file = join(mkdtempSync(join(tmpdir(), 'showcase-tidy-')), 'moved.jsonl');
	const bare = fakeStore(rows());
	assert.equal((await cli(bare, ['--target', 'demo', '--yes'])).code, 64);
	assert.equal(bare.requests.length, 0);
	const devFree = fakeStore(rows());
	const stopped = await cli(devFree, ['--target', 'dev-free', '--yes', '--record', file]);
	assert.equal(stopped.code, 2);
	assert.equal(devFree.deletes().length, 0);
	// the record file is proved writable before anything moves, so it exists but lists nothing
	assert.equal(readFileSync(file, 'utf8'), '');
	const store = fakeStore(rows());
	const { code, logs } = await cli(store, ['--target', 'demo', '--yes', '--record', file]);
	assert.equal(code, 0);
	const lines = readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse);
	assert.deepEqual(
		lines.map(({ type, id }) => ({ type, id })),
		[
			{ type: 'order', id: 1001 },
			{ type: 'product', id: 71 },
		]
	);
	assert.ok(
		lines.every((l) => Object.keys(l).join() === 'at,type,id' && !Number.isNaN(Date.parse(l.at)))
	);
	const out = JSON.parse(logs.at(-1));
	assert.deepEqual(Object.keys(out), ['write', 'firstRun', 'counts', 'stats']);
	assert.equal(out.stats.writes, 2);
});

test('a --record path that cannot be written stops the tidy before any request', async () => {
	const store = fakeStore({ orders: [order(1001, AFTER_BASELINE)], products: [] });
	const logs = [];
	const missing = join(tmpdir(), `showcase-tidy-missing-${process.pid}`, 'moved.jsonl');
	const argv = ['tidy', '--target', 'demo', '--credentials-cmd', '/unused', '--yes'];
	const code = await run([...argv, '--record', missing], {
		fetchImpl: store.fetchImpl,
		sleep: noSleep,
		now: () => NOW,
		log: (l) => logs.push(l),
		readCredentials: async () => CREDS,
	});
	assert.equal(code, 1);
	assert.equal(store.requests.length, 0);
	assert.ok(logs.at(-1).startsWith('stopped: '));
});

test('every DELETE in this file sent force=false, and none sent force=true', () => {
	const deletes = ALL.filter((r) => r.method === 'DELETE');
	assert.ok(deletes.length > 500);
	for (const r of deletes) assert.equal(new URLSearchParams(r.query).get('force'), 'false', r.path);
	for (const r of ALL) assert.ok(!/force=true/i.test(r.query + r.raw), r.path);
});

test('no request in this file touched customers or coupons', () => {
	assert.ok(ALL.length > 500);
	for (const r of ALL) assert.ok(!/customers|coupons/.test(r.path), `${r.method} ${r.path}`);
});
