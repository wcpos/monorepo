/** Applies a showcase plan to a store, skipping every step the store already shows done. Logs counts only. */
import { randomBytes } from 'node:crypto';

import {
	cashTendered,
	planCoupons,
	planCustomers,
	planOrders,
	toZoned,
	uuidFrom,
} from './plan.mjs';
import { SEED_META_KEY } from './targets.mjs';

const WC = '/wp-json/wc/v3';
const INDEX_FIELDS = 'id,status,date_paid_gmt,billing,meta_data,refunds,total,line_items';
/** The first live order's paid date must land within this of its sale time. */
const PAID_DATE_TOLERANCE_MS = 2000;

export class SeedSafetyError extends Error {
	name = 'SeedSafetyError';
}

const metaOf = (record) =>
	Object.fromEntries((record?.meta_data ?? []).map((m) => [m.key, m.value]));
const metaList = (obj) => Object.entries(obj).map(([key, value]) => ({ key, value }));
const seconds = (iso) => String(Math.floor(Date.parse(iso) / 1000));
const gmt = (iso) => iso.slice(0, 19);

export async function readStoreFacts(client, target) {
	const rows = await client.getAll('/wp-json/wcpos/v1/stores');
	const storeFacts = {};
	const registers = {};
	for (const store of target.stores) {
		const r = rows.find((row) => Number(row.id) === store.id);
		if (!r && store.id !== 0) throw new SeedSafetyError(`store ${store.id} not found`);
		const address = {
			first_name: '',
			last_name: '',
			company: '',
			address_1: r?.store_address ?? '',
			city: r?.store_city ?? '',
		};
		Object.assign(address, {
			state: r?.store_state ?? '',
			postcode: r?.store_postcode ?? '',
			country: r?.store_country ?? '',
		});
		storeFacts[store.key] = { timeZone: r?.timezone || 'UTC', address };
		const list = await client
			.getAll('/wp-json/wcpos/v2/registers', { store_id: store.id })
			.catch(() => []);
		registers[store.key] = [...list].sort((a, b) => String(a.id).localeCompare(String(b.id)));
	}
	const fields = {
		status: 'publish',
		type: 'simple',
		stock_status: 'instock',
		_fields: 'id,price,manage_stock,stock_quantity',
	};
	const products = (await client.getAll(`${WC}/products`, fields)).filter(
		(p) => Number(p.price) > 0
	);
	return { storeFacts, registers, products };
}

/** Finds each record by `query`; creates the missing ones with the seed's meta key. */
async function ensureAll(client, kind, items, { write, log }) {
	const ids = {};
	let found = 0;
	for (const { key, query, body } of items) {
		const [existing] = await client.get(`${WC}/${kind}`, query);
		if (existing) found += 1;
		const row =
			existing ??
			(write
				? await client.post(`${WC}/${kind}`, {
						...body(),
						meta_data: [{ key: SEED_META_KEY, value: key }],
					})
				: null);
		ids[key] = row?.id ?? null;
	}
	log(`${kind}: ${found} found, ${items.length - found} ${write ? 'created' : 'to create'}`);
	return ids;
}

/** A new customer gets a random password that lives only in this process. */
export const applyCustomers = (client, target, planned, options) =>
	ensureAll(
		client,
		'customers',
		planned.map(({ key, storeKey: _, ...fields }) => ({
			key,
			query: { email: fields.email, role: 'all' },
			body: () => ({ ...fields, password: randomBytes(18).toString('base64url') }),
		})),
		options
	);

export const applyCoupons = (client, target, planned, options) =>
	ensureAll(
		client,
		'coupons',
		planned.map((c) => ({ key: c.code, query: { code: c.code }, body: () => c })),
		options
	).then(() => {});

/** Adds each of the target's tax rates the site lacks, matched on country, class and name; never changes one. */
export async function applyTaxRates(client, target, { write, log }) {
	const rows = await client.getAll(`${WC}/taxes`);
	const same = (a, b) => ['country', 'class', 'name'].every((k) => a[k] === b[k]);
	const missing = target.taxRates.filter((rate) => !rows.some((row) => same(row, rate)));
	for (const rate of write ? missing : [])
		await client.post(`${WC}/taxes`, { ...rate, shipping: true });
	const found = target.taxRates.length - missing.length;
	log(`tax rates: ${found} found, ${missing.length} ${write ? 'created' : 'to create'}`);
}

export async function indexExistingOrders(client, target, extraFields = '') {
	const params = {
		after: `${target.windowStart}T00:00:00`,
		dates_are_gmt: 'true',
		status: 'any',
		_fields: INDEX_FIELDS + extraFields,
	};
	const rows = await client.getAll(`${WC}/orders`, params);
	return new Map(
		rows.filter((row) => metaOf(row)[SEED_META_KEY]).map((row) => [metaOf(row)[SEED_META_KEY], row])
	);
}

/** Till meta for an order, every value a string. Cash meta needs the store's own total. */
function tillMeta(target, store, order, registers, total) {
	const meta = store.id !== 0 ? { _pos_store: String(store.id) } : {};
	const cashier = store.cashierIds.length
		? store.cashierIds[order.cashierIndex % store.cashierIds.length]
		: target.fallbackCashierId;
	if (cashier != null) meta._pos_user = meta._pos_user_created = String(cashier);
	if (registers.length) {
		const id = registers[order.registerIndex % registers.length].id;
		Object.assign(meta, {
			_wcpos_register: String(id),
			_wcpos_till: uuidFrom(`till:${id}`),
			_wcpos_session: uuidFrom(`session:${id}:${order.localDate}`),
		});
	}
	meta._wcpos_sale_time =
		meta._wcpos_sale_received_gmt =
		meta._wcpos_completed_at =
			order.saleTimeUtc;
	Object.assign(meta, {
		_wcpos_sale_tz: order.timeZone,
		_wcpos_sale_counter: String(order.saleCounter),
	});
	if (order.paymentMethod === 'pos_cash' && total != null) {
		const tendered = cashTendered(order.key, total);
		meta._pos_cash_amount_tendered = tendered;
		meta._pos_cash_change = (
			(Math.round(tendered * 100) - Math.round(Number(total) * 100)) /
			100
		).toFixed(2);
	}
	return meta;
}

async function stockOf(client, ids) {
	if (!ids.length) return {};
	const rows = await client.get(`${WC}/products`, {
		include: ids.join(','),
		_fields: 'id,stock_quantity',
		per_page: 100,
	});
	return Object.fromEntries(rows.map((p) => [p.id, p.stock_quantity]));
}

/** The first new completed order must leave stock alone and read back completed, backdated and keyed. */
async function checkFirstOrder(client, order, id, stockBefore) {
	const stockAfter = await stockOf(client, Object.keys(stockBefore).map(Number));
	const moved = Object.keys(stockBefore).find((pid) => stockAfter[pid] !== stockBefore[pid]);
	if (moved) throw new SeedSafetyError(`stock of product ${moved} changed on the first order`);
	const fresh = await client.get(`${WC}/orders/${id}`);
	const off = Math.abs(
		Date.parse(`${gmt(fresh.date_paid_gmt ?? '')}Z`) - Date.parse(order.saleTimeUtc)
	);
	const meta = metaOf(fresh);
	if (
		fresh.status !== 'completed' ||
		!(off <= PAID_DATE_TOLERANCE_MS) ||
		!meta[SEED_META_KEY] ||
		!meta._wcpos_sale_time
	) {
		throw new SeedSafetyError(`order ${id} did not read back completed, backdated and keyed`);
	}
}

export async function applyOrders(client, target, orders, context, { write, limit = Infinity }) {
	const { storeFacts, registers, products, customerIds, customers, existing } = context;
	const stores = Object.fromEntries(target.stores.map((s) => [s.key, s]));
	const planned = Object.fromEntries(customers.map((c) => [c.key, c]));
	const managed = new Set(products.filter((p) => p.manage_stock).map((p) => p.id));
	const counts = {
		planned: orders.length,
		created: 0,
		completed: 0,
		parked: 0,
		backdated: 0,
		refunded: 0,
		reconciled: 0,
		unchanged: 0,
		touched: 0,
	};
	let firstChecked = false;
	try {
		for (const order of orders) {
			if (counts.touched >= limit) break;
			const [store, regs] = [stores[order.storeKey], registers[order.storeKey] ?? []];
			const customer = order.customerKey ? planned[order.customerKey] : null;
			let ex = existing.get(order.key);
			let [touched, tillSent] = [false, false];
			const send = async (method, path, body, simulate) => (
				(touched = true),
				write ? client[method](path, body) : simulate()
			);
			const check = write && !firstChecked && !ex && order.status === 'completed';
			const stockBefore = check
				? await stockOf(
						client,
						order.lines.map((l) => l.productId).filter((id) => managed.has(id))
					)
				: null;

			// 1. Create parked, with no billing email, so nothing can mail or reduce stock yet.
			if (!ex) {
				const address = storeFacts[order.storeKey].address;
				const { email: _email, ...billing } = customer?.billing ?? address;
				const body = {
					status: 'pos-open',
					currency: order.currency,
					customer_id: customer ? (customerIds[customer.key] ?? 0) : 0,
					billing,
					shipping: customer?.shipping ?? address,
					payment_method: order.paymentMethod,
					payment_method_title: order.paymentTitle,
					date_created_gmt: gmt(order.saleTimeUtc),
					line_items: order.lines.map((l) => ({ product_id: l.productId, quantity: l.quantity })),
					...(order.couponCode ? { coupon_lines: [{ code: order.couponCode }] } : {}),
					meta_data: [
						{ key: SEED_META_KEY, value: order.key },
						{ key: '_woocommerce_pos_uuid', value: uuidFrom(order.key) },
						// A guest's billing address is the store's, so a guest is taxed where the store is and a customer where they live.
						{ key: '_woocommerce_pos_tax_based_on', value: 'billing' },
					],
				};
				ex = await send('post', '/wp-json/wcpos/v1/orders', body, () => ({
					status: 'pos-open',
					billing,
					refunds: [],
					meta_data: [],
					total: '0',
				}));
				counts.created += 1;
			}
			const path = `${WC}/orders/${ex.id}`;

			// 2. Complete with stock already marked reduced; a parked order only takes the till meta.
			if (ex.status === 'pos-open') {
				const meta = tillMeta(target, store, order, regs, ex.total);
				if (order.status === 'completed') {
					ex = await send(
						'put',
						path,
						{ status: 'completed', meta_data: metaList({ ...meta, _order_stock_reduced: 'yes' }) },
						() => ({ ...ex, status: 'completed' })
					);
					[counts.completed, tillSent] = [counts.completed + 1, true];
				} else if (metaOf(ex)._wcpos_sale_time === undefined) {
					ex = await send('put', path, { meta_data: metaList(meta) }, () => ex);
					[counts.parked, tillSent] = [counts.parked + 1, true];
				}
			}

			if (order.status === 'completed') {
				// 3. Backdate after completing, which stamps the paid date as now; the email goes on last.
				if (
					gmt(ex.date_paid_gmt ?? '') !== gmt(order.saleTimeUtc) ||
					(customer && !ex.billing?.email)
				) {
					const at = seconds(order.saleTimeUtc);
					const body = {
						...(customer ? { billing: { email: customer.email } } : {}),
						meta_data: metaList({ _date_paid: at, _date_completed: at }),
					};
					ex = await send('put', path, body, () => ({ ...ex, date_paid_gmt: order.saleTimeUtc }));
					counts.backdated += 1;
				}
				if (check) {
					// Stays armed until an order with a managed line has proved stock stays put.
					if (Object.keys(stockBefore).length) firstChecked = true;
					await checkFirstOrder(client, order, ex.id, stockBefore);
				}
				// 4. Refund one unit of the first line, with no gateway call and no restock.
				if (order.refund && !(ex.refunds ?? []).length) {
					const line = ex.line_items?.[order.refund.lineIndex];
					const unit = line ? (Number(line.total) / line.quantity).toFixed(2) : '0.00';
					// One unit's share of each line tax, as calculate-refund.ts sends it from the POS.
					const tax = (line?.taxes ?? []).map((t) => ({
						id: t.id,
						refund_total: (Number(t.total) / line.quantity).toFixed(2),
					}));
					const amount = tax.reduce((sum, t) => sum + Number(t.refund_total), Number(unit));
					const items = [
						{ id: line?.id, quantity: order.refund.quantity, refund_total: unit, refund_tax: tax },
					];
					const body = {
						amount: amount.toFixed(2),
						reason: order.refund.reason,
						line_items: items,
						api_refund: false,
						api_restock: false,
					};
					ex = { ...ex, refunds: [await send('post', `${path}/refunds`, body, () => ({}))] };
					counts.refunded += 1;
				}
			}

			// Reconcile till ids on orders written before the cashier or register list changed.
			const meta = tillMeta(target, store, order, regs, ex.total);
			if (
				!tillSent &&
				['_pos_user', '_wcpos_register'].some(
					(k) => meta[k] !== undefined && String(metaOf(ex)[k] ?? '') !== meta[k]
				)
			) {
				await send('put', path, { meta_data: metaList(meta) }, () => ex);
				counts.reconciled += 1;
			}
			counts[touched ? 'touched' : 'unchanged'] += 1;
		}
	} catch (err) {
		err.counts = counts;
		throw err;
	}
	return counts;
}

/** Plans against the store's own facts, then applies customers, coupons and orders. */
export async function runApply(client, target, { write, limit, through, log }) {
	const facts = await readStoreFacts(client, target);
	if (!facts.products.length)
		throw new SeedSafetyError('the store has no in-stock simple products with a price');
	const customers = planCustomers(target);
	const customerIds = await applyCustomers(client, target, customers, { write, log });
	await applyCoupons(client, target, planCoupons(target), { write, log });
	await applyTaxRates(client, target, { write, log });
	const orders = planOrders(target, {
		storeFacts: facts.storeFacts,
		products: facts.products,
		customers,
		through,
	});
	const existing = await indexExistingOrders(client, target);
	return {
		counts: await applyOrders(
			client,
			target,
			orders,
			{ ...facts, customerIds, customers, existing },
			{ write, limit, log }
		),
		orders,
	};
}

export async function verify(client, target, orders) {
	const index = await indexExistingOrders(client, target, ',total_tax,tax_lines');
	const perStore = {};
	for (const o of orders) {
		const s = (perStore[o.storeKey] ??= {
			planned: 0,
			found: 0,
			missing: 0,
			completed: 0,
			parked: 0,
			refunded: 0,
			taxed: 0,
			wrongDay: 0,
			byHour: {},
			taxLabels: {},
		});
		const row = index.get(o.key);
		const local = row?.date_paid_gmt
			? toZoned(new Date(`${gmt(row.date_paid_gmt)}Z`), o.timeZone)
			: null;
		const hits = {
			planned: true,
			found: row,
			missing: !row,
			completed: ['completed', 'refunded'].includes(row?.status),
			parked: row?.status === 'pos-open',
		};
		Object.assign(hits, {
			refunded: row?.refunds?.length,
			taxed: Number(row?.total_tax) > 0,
			wrongDay: local && local.localDate !== o.localDate,
		});
		for (const [k, hit] of Object.entries(hits)) s[k] += hit ? 1 : 0;
		if (local) s.byHour[local.hour] = (s.byHour[local.hour] ?? 0) + 1;
		for (const { label, rate_percent } of row?.tax_lines ?? []) {
			const k = `${label}@${rate_percent}`;
			s.taxLabels[k] = (s.taxLabels[k] ?? 0) + 1;
		}
	}
	return { perStore };
}
