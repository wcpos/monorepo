import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
	applyOrders,
	readStoreFacts,
	resolveTimeZone,
	runApply,
	SeedSafetyError,
	verify,
} from './apply.mjs';
import { createClient } from './client.mjs';
import {
	ALL,
	CREATE,
	CREDS,
	fakeStore,
	metaValue,
	MONTH,
	noSleep,
	REGISTERS,
	target,
	THROUGH,
} from './fake-store.mjs';
import { planCustomers, planOrders } from './plan.mjs';
import { SEED_META_KEY } from './targets.mjs';

async function apply(store, { tgt = target, write = true, through = THROUGH } = {}, logs = []) {
	const log = (line) => logs.push(String(line));
	const client = createClient({
		url: tgt.url,
		credentials: CREDS,
		fetchImpl: store.fetchImpl,
		sleep: noSleep,
		log,
	});
	return runApply(client, tgt, { write, through, log }).then(
		(r) => ({ ...r, logs }),
		(error) => ({ error, logs })
	);
}

test('a full apply makes the four steps in order, and the create carries no billing email', async () => {
	const store = fakeStore();
	const { orders, error } = await apply(store);
	assert.equal(error, undefined);
	const sent = store.writesFor(
		orders.find((o) => o.status === 'completed' && o.refund && o.customerKey).key
	);
	const shapes = sent.map((r) => `${r.method} ${r.path.replace(/\/\d+/g, '/:id')}`);
	assert.deepEqual(shapes, [
		`POST ${CREATE}`,
		'PUT /wp-json/wc/v3/orders/:id',
		'PUT /wp-json/wc/v3/orders/:id',
		'POST /wp-json/wc/v3/orders/:id/refunds',
	]);
	assert.equal(sent[1].body.status, 'completed');
	assert.ok(
		metaValue(sent[2].body, '_date_paid') && sent[2].body.billing.email.endsWith('@example.com')
	);
	assert.ok(store.creates().every((r) => !('email' in r.body.billing)));
	assert.equal(store.orders.length, orders.length);
});

test('a second apply on the same store makes no writes', async () => {
	const store = fakeStore();
	await apply(store);
	const before = store.writes().length;
	assert.equal((await apply(store)).counts.touched, 0);
	assert.equal(store.writes().length, before);
});

test('orders stopped after step 1 or step 2 finish on the next apply with no duplicate create', async () => {
	for (const stopAfter of [1, 2]) {
		let failed = false;
		const isStep = (r) =>
			r.method === 'PUT' &&
			(stopAfter === 1 ? r.body.status === 'completed' : r.raw.includes('_date_paid'));
		const store = fakeStore({ failWhen: (r) => isStep(r) && !failed && (failed = true) });
		assert.ok((await apply(store)).error, `stop after step ${stopAfter}`);
		const second = await apply(store);
		assert.equal(second.error, undefined);
		assert.equal(
			new Set(store.creates().map((r) => metaValue(r.body, SEED_META_KEY))).size,
			store.creates().length
		);
		assert.equal(store.orders.length, second.orders.length);
		assert.ok(store.orders.every((o) => o.status === 'pos-open' || metaValue(o, '_date_paid')));
		const settled = store.writes().length;
		await apply(store);
		assert.equal(store.writes().length, settled);
	}
});

test('a parked order is never sent a status, stock flag, paid date or refund', async () => {
	const store = fakeStore();
	const parked = (await apply(store, { through: MONTH })).orders.filter(
		(o) => o.status === 'pos-open'
	);
	assert.ok(parked.length > 0 && parked.every((o) => store.writesFor(o.key).length === 2));
	for (const r of parked.flatMap((o) => store.writesFor(o.key).slice(1)))
		assert.ok(
			r.method === 'PUT' &&
				r.body.status === undefined &&
				!/_order_stock_reduced|_date_paid/.test(r.raw),
			r.path
		);
});

test('changing cashierIds reconciles each affected order with one till-meta PUT and nothing else', async () => {
	const store = fakeStore();
	const base = structuredClone(target);
	base.stores[0].cashierIds = [];
	const { orders } = await apply(store, { tgt: base });
	const before = store.writes().length;
	const changed = structuredClone(base);
	changed.stores[0].cashierIds = [4, 9];
	await apply(store, { tgt: changed });
	const affected = orders.filter(
		(o) => o.storeKey === changed.stores[0].key && o.cashierIndex % 2 === 1
	);
	const sent = store.writes().slice(before);
	assert.ok(affected.length > 0);
	assert.equal(sent.length, affected.length);
	assert.equal(new Set(sent.map((r) => r.path)).size, affected.length);
	assert.ok(
		sent.every(
			(r) =>
				r.method === 'PUT' &&
				Object.keys(r.body).join() === 'meta_data' &&
				metaValue(r.body, '_pos_user') === '9'
		)
	);
});

test('stock moving on the first completion is a safety stop, and no second order is created', async () => {
	const store = fakeStore({ reduceStockOnComplete: true });
	const { error } = await apply(store);
	assert.ok(error instanceof SeedSafetyError);
	assert.equal(store.creates().length, 1);
});

test('nothing logged across a full run names a customer, an email or the password', async () => {
	const { logs } = await apply(fakeStore(), { through: MONTH });
	const secrets = [
		CREDS.password,
		CREDS.username,
		...planCustomers(target).flatMap((c) => [c.first_name, c.last_name, c.email]),
	];
	assert.ok(logs.length > 0);
	for (const line of logs)
		for (const secret of secrets) assert.ok(!line.includes(secret), 'a log line names store data');
});

test('createClient refuses plain http and any url that is not a target', () => {
	for (const url of ['http://demo.wcpos.com', 'https://example.org'])
		assert.throws(
			() => createClient({ url, credentials: CREDS, fetchImpl: () => assert.fail('no request') }),
			/refusing/
		);
});

test('write: false makes no POST or PUT', async () => {
	const store = fakeStore();
	const { counts } = await apply(store, { write: false });
	assert.equal(store.writes().length, 0);
	assert.ok(counts.created > 0 && counts.completed > 0);
});

test('the order a store lists its registers in does not move an order to another register', async () => {
	const store = fakeStore({ registers: [...REGISTERS] });
	assert.equal((await apply(store)).error, undefined);
	const before = store.writes().length;
	store.registers = [...REGISTERS].reverse();
	assert.equal((await apply(store)).error, undefined);
	assert.equal(store.writes().length, before);
});

test('the stock check stays armed past a first order with no managed line', async () => {
	const store = fakeStore({ reduceStockOnComplete: true });
	const log = () => {};
	const client = createClient({
		url: target.url,
		credentials: CREDS,
		fetchImpl: store.fetchImpl,
		sleep: noSleep,
		log,
	});
	const facts = await readStoreFacts(client, target);
	const productFor = [12, 11, 11];
	const orders = planOrders(target, {
		storeFacts: facts.storeFacts,
		products: facts.products,
		customers: [],
		through: THROUGH,
	})
		.filter((o) => o.status === 'completed')
		.slice(0, productFor.length)
		.map((o, i) => ({
			...o,
			customerKey: null,
			couponCode: null,
			refund: null,
			lines: [{ productId: productFor[i], quantity: 1 }],
		}));
	const context = { ...facts, customerIds: {}, customers: [], existing: new Map() };
	await assert.rejects(
		applyOrders(client, target, orders, context, { write: true, log }),
		SeedSafetyError
	);
	assert.equal(store.creates().length, 2);
});

const taxWrites = (store) => store.writes().filter((r) => r.path.endsWith('/taxes'));

test('a missing tax rate is created once, and a second apply creates none', async () => {
	const store = fakeStore({ taxes: [{ id: 1, ...target.taxRates[0] }] });
	const { logs } = await apply(store);
	assert.deepEqual(
		taxWrites(store).map((r) => r.body),
		[{ ...target.taxRates[1], shipping: true }]
	);
	assert.ok(logs.includes('tax rates: 1 found, 1 created'));
	await apply(store);
	assert.equal(taxWrites(store).length, 1);
});

test('a tax rate that exists is neither updated nor removed', async () => {
	const taxes = target.taxRates.map((r, i) => ({ id: i + 1, ...r, rate: '5.0000' }));
	const store = fakeStore({ taxes });
	assert.ok((await apply(store)).logs.includes('tax rates: 2 found, 0 created'));
	assert.equal(taxWrites(store).length, 0);
	assert.deepEqual(
		store.taxes,
		target.taxRates.map((r, i) => ({ id: i + 1, ...r, rate: '5.0000' }))
	);
});

test('a dry run sends no write to taxes and still counts the rate it would create', async () => {
	const store = fakeStore({ taxes: [{ id: 1, ...target.taxRates[1] }] });
	const { logs } = await apply(store, { write: false });
	assert.equal(taxWrites(store).length, 0);
	assert.ok(logs.includes('tax rates: 1 found, 1 to create'));
});

test('every created order is taxed on its billing address', async () => {
	const store = fakeStore();
	await apply(store);
	assert.ok(store.creates().length > 0);
	for (const r of store.creates())
		assert.equal(metaValue(r.body, '_woocommerce_pos_tax_based_on'), 'billing');
});

test('verify counts tax lines per store by label and rate', async () => {
	const store = fakeStore();
	const { orders } = await apply(store);
	const [eu, us] = ['eu', 'us'].map((k) => orders.find((o) => o.storeKey === k).key);
	store.byKey(eu).tax_lines = [{ label: 'BTW', rate_percent: 21 }];
	store.byKey(us).tax_lines = [
		{ label: 'AL', rate_percent: 4 },
		{ label: 'AL', rate_percent: 4 },
	];
	const client = createClient({
		url: target.url,
		credentials: CREDS,
		fetchImpl: store.fetchImpl,
		sleep: noSleep,
		log: () => {},
	});
	const { perStore } = await verify(client, target, orders);
	assert.deepEqual(perStore.eu.taxLabels, { 'BTW@21': 1 });
	assert.deepEqual(perStore.us.taxLabels, { 'AL@4': 2 });
	assert.deepEqual(perStore.uk.taxLabels, {});
});

test('no request in any check used DELETE or sent force', () => {
	assert.ok(ALL.length > 1000);
	for (const r of ALL) assert.ok(r.method !== 'DELETE' && !/force/i.test(r.query + r.raw), r.path);
});

test('a refund carries one unit of each line tax, and a line with no taxes refunds its net unit', async () => {
	const refundOf = async (lineTaxes) => {
		const store = fakeStore({ lineTaxes });
		const client = createClient({
			url: target.url,
			credentials: CREDS,
			fetchImpl: store.fetchImpl,
			sleep: noSleep,
			log: () => {},
		});
		const facts = await readStoreFacts(client, target);
		const [order] = planOrders(target, {
			storeFacts: facts.storeFacts,
			products: facts.products,
			customers: [],
			through: THROUGH,
		})
			.filter((o) => o.status === 'completed')
			.map((o) => ({
				...o,
				customerKey: null,
				couponCode: null,
				refund: { lineIndex: 0, quantity: 1, reason: 'Damaged' },
				lines: [{ productId: 11, quantity: 2 }],
			}));
		const context = { ...facts, customerIds: {}, customers: [], existing: new Map() };
		await applyOrders(client, target, [order], context, { write: true, log: () => {} });
		return store.writes().find((r) => r.path.endsWith('/refunds')).body;
	};
	const taxed = await refundOf([
		{ id: 7, total: '4.20' },
		{ id: 8, total: '1.00' },
	]);
	assert.deepEqual(taxed.line_items[0].refund_tax, [
		{ id: 7, refund_total: '2.10' },
		{ id: 8, refund_total: '0.50' },
	]);
	assert.equal(taxed.line_items[0].refund_total, '10.00');
	assert.equal(taxed.amount, '12.60');
	const net = await refundOf(undefined);
	assert.deepEqual(net.line_items[0].refund_tax, []);
	assert.equal(net.line_items[0].refund_total, '10.00');
	assert.equal(net.amount, '10.00');
});

async function zonesOf(store) {
	const client = createClient({ url: target.url, credentials: CREDS, fetchImpl: store.fetchImpl });
	const { storeFacts } = await readStoreFacts(client, target);
	return Object.fromEntries(Object.entries(storeFacts).map(([k, f]) => [k, f.timeZone]));
}

test("a store's own timezone wins over the site's", async () => {
	const zones = await zonesOf(fakeStore({ site: { timezone_string: 'Asia/Tokyo' } }));
	assert.equal(zones.eu, 'Europe/Amsterdam');
	assert.equal(zones.us, 'America/Los_Angeles');
});

test("a store with an empty timezone inherits the site's, as the app resolves it", async () => {
	const site = { timezone_string: 'Asia/Tokyo', gmt_offset: '9' };
	const zones = await zonesOf(fakeStore({ zones: { uk: ' ' }, site }));
	assert.equal(zones.uk, 'Asia/Tokyo');
	const offset = await zonesOf(fakeStore({ zones: { uk: '' }, site: { gmt_offset: '-5' } }));
	assert.equal(offset.uk, 'Etc/GMT+5');
	const half = resolveTimeZone({ timezone: '' }, { timezone_string: '', gmt_offset: 5.5 });
	assert.equal(half, '+05:30');
});

test('a store whose timezone cannot be resolved stops the run, naming the store id', async () => {
	const site = { timezone_string: 'Nowhere' };
	const store = fakeStore({ zones: { wholesale: 'Not/AZone' }, site });
	const { error, logs } = await apply(store);
	assert.ok(error instanceof SeedSafetyError);
	assert.equal(error.message, 'store 14214 has no usable timezone');
	assert.equal(store.writes().length, 0);
	assert.equal(logs.length, 0);
});
