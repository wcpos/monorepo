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
import { run } from './cli.mjs';
import { createClient } from './client.mjs';
import { planCustomers, planOrders } from './plan.mjs';
import { SEED_META_KEY, TARGETS } from './targets.mjs';

const CREDS = { username: 'seed-admin', password: 'pw-Zq81-secret' };
const MARKER = 'BODY-MARKER-7731';
const THROUGH = new Date('2026-10-12T23:00:00Z');
const MONTH = new Date('2026-11-04T23:00:00Z');
const CREATE = '/wp-json/wcpos/v1/orders';
const ALL = [];
/** Register ids are uuids; the second sorts first, so a store listing them as given is out of order. */
const REGISTERS = [
	{ id: '7c1e4a52-9d3b-4f60-8a21-3e5b9c0d4f17' },
	{ id: '2b8f6d13-5a4e-4c97-b1d0-6f2e8a7c9b45' },
];
const target = TARGETS.demo;
const noSleep = async () => {};
const metaValue = (record, key) => record.meta_data.find((m) => m.key === key)?.value;

/** An in-memory store answering the routes the seed uses, loosely as WooCommerce would. */
function fakeStore({
	reduceStockOnComplete = false,
	failWhen = () => false,
	registers = REGISTERS,
	taxes = [],
	lineTaxes,
	zones = {},
	site = { timezone_string: 'Europe/London', gmt_offset: '0' },
} = {}) {
	const s = { requests: [], customers: [], coupons: [], orders: [], nextId: 500, registers, taxes };
	s.products = [
		[11, '10.00', true, 50],
		[12, '4.50', false, null],
		[13, '7.25', true, 20],
	].map(([id, price, manage_stock, stock_quantity]) => ({
		id,
		price,
		manage_stock,
		stock_quantity,
	}));
	const stores = target.stores.map((st) => ({
		id: st.id,
		timezone: zones[st.key] ?? (st.key === 'eu' ? 'Europe/Amsterdam' : 'America/Los_Angeles'),
		store_city: 'Portland',
	}));
	const page = (rows, q) =>
		rows.slice((q.get('page') - 1) * q.get('per_page')).slice(0, q.get('per_page'));
	const add = (list, body) => list[list.push({ id: (s.nextId += 1), ...body }) - 1];
	const product = (id) => s.products.find((p) => p.id === id);
	const update = (order, { status, billing, meta_data = [] }) => {
		if (status === 'completed' && order.status !== 'completed') {
			Object.assign(order, { status, date_paid_gmt: '2026-11-04T12:00:00' });
			for (const l of reduceStockOnComplete ? order.line_items : [])
				if (product(l.product_id).manage_stock) product(l.product_id).stock_quantity -= l.quantity;
		}
		if (billing) order.billing = { ...order.billing, ...billing };
		for (const { key, value } of meta_data) {
			order.meta_data = order.meta_data.filter((m) => m.key !== key).concat([{ key, value }]);
			if (key === '_date_paid')
				order.date_paid_gmt = new Date(value * 1000).toISOString().slice(0, 19);
		}
		return order;
	};
	const create = ({ status, billing, line_items, meta_data }) => {
		const lines = line_items.map((l) => ({
			id: (s.nextId += 1),
			...l,
			total: (product(l.product_id).price * l.quantity).toFixed(2),
			...(lineTaxes ? { taxes: lineTaxes } : {}),
		}));
		const total = lines.reduce((t, l) => t + Number(l.total), 0).toFixed(2);
		return update(
			add(s.orders, {
				status,
				billing,
				total,
				date_paid_gmt: null,
				refunds: [],
				meta_data: [],
				line_items: lines,
				total_tax: '0.00',
			}),
			{ meta_data }
		);
	};
	s.fetchImpl = async (href, init = {}) => {
		const u = new URL(href);
		const q = u.searchParams;
		const request = {
			method: init.method ?? 'GET',
			path: u.pathname,
			query: u.search,
			raw: init.body ?? '',
			body: init.body && JSON.parse(init.body),
		};
		s.requests.push(request);
		ALL.push(request);
		const order = s.orders.find((o) => o.id === Number(u.pathname.split('/')[5]));
		const routes = {
			'GET /': () => site,
			'GET /wcpos/v1/stores': () => page(stores, q),
			'GET /wcpos/v2/registers': () => page(s.registers, q),
			'GET /wc/v3/products': () =>
				q.has('include')
					? s.products.filter((p) => q.get('include').split(',').includes(String(p.id)))
					: page(s.products, q),
			'GET /wc/v3/customers': () => s.customers.filter((c) => c.email === q.get('email')),
			'GET /wc/v3/coupons': () => s.coupons.filter((c) => c.code === q.get('code')),
			'POST /wc/v3/customers': () => add(s.customers, request.body),
			'POST /wc/v3/coupons': () => add(s.coupons, request.body),
			'GET /wc/v3/taxes': () => page(s.taxes, q),
			'POST /wc/v3/taxes': () => add(s.taxes, request.body),
			'GET /wc/v3/orders': () => page(s.orders, q),
			'GET /wc/v3/orders/:id': () => order,
			'POST /wcpos/v1/orders': () => create(request.body),
			'PUT /wc/v3/orders/:id': () => update(order, request.body),
			'POST /wc/v3/orders/:id/refunds': () =>
				add(order.refunds, { total: `-${request.body.amount}` }),
		};
		const route =
			routes[`${request.method} ${u.pathname.replace('/wp-json', '').replace(/\/\d+/g, '/:id')}`];
		const failed = failWhen(request) || !route;
		const body = failed
			? { code: 'internal_server_error', message: `${MARKER} maya.thompson@example.com` }
			: route();
		return new Response(JSON.stringify(body), {
			status: failed ? 500 : 200,
			headers: { 'content-type': 'application/json' },
		});
	};
	s.writes = () => s.requests.filter((r) => r.method !== 'GET');
	s.creates = () => s.writes().filter((r) => r.path === CREATE);
	s.byKey = (key) => s.orders.find((o) => metaValue(o, SEED_META_KEY) === key);
	/** The create for `key`, then every write to its order's path. */
	s.writesFor = (key) =>
		s
			.writes()
			.filter((r) =>
				r.path === CREATE
					? metaValue(r.body, SEED_META_KEY) === key
					: new RegExp(`/orders/${s.byKey(key).id}(/|$)`).test(r.path)
			);
	return s;
}

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
	const { code, logs } = await cli(store);
	assert.equal(code, 2);
	assert.equal(store.creates().length, 1);
	assert.ok(logs.some((l) => l.startsWith('stopped: ') && l.includes('stock')));
	assert.ok(
		(await apply(fakeStore({ reduceStockOnComplete: true }))).error instanceof SeedSafetyError
	);
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
