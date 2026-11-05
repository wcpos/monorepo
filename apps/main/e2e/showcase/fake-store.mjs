import { SEED_META_KEY, TARGETS } from './targets.mjs';

export const CREDS = { username: 'seed-admin', password: 'pw-Zq81-secret' };
export const MARKER = 'BODY-MARKER-7731';
export const THROUGH = new Date('2026-10-12T23:00:00Z');
export const MONTH = new Date('2026-11-04T23:00:00Z');
export const CREATE = '/wp-json/wcpos/v1/orders';
export const ALL = [];
/** Register ids are uuids; the second sorts first, so a store listing them as given is out of order. */
export const REGISTERS = [
	{ id: '7c1e4a52-9d3b-4f60-8a21-3e5b9c0d4f17' },
	{ id: '2b8f6d13-5a4e-4c97-b1d0-6f2e8a7c9b45' },
];
export const target = TARGETS.demo;
export const noSleep = async () => {};
export const metaValue = (record, key) => record.meta_data.find((m) => m.key === key)?.value;

/** An in-memory store answering the routes the seed uses, loosely as WooCommerce would. */
export function fakeStore({
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
