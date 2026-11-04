import assert from 'node:assert/strict';
import { test } from 'node:test';

import { planCoupons, planCustomers, planOrders, summarise, toZoned, uuidFrom } from './plan.mjs';
import { TARGETS } from './targets.mjs';

const demo = TARGETS.demo;
const products = Array.from({ length: 200 }, (_, i) => ({
	id: 1000 + ((i * 37) % 200),
	price: '4.50',
}));
const storeFacts = {
	us: { timeZone: 'America/Los_Angeles' },
	uk: { timeZone: 'Europe/London' },
	wholesale: { timeZone: 'America/Los_Angeles' },
	eu: { timeZone: 'Europe/Amsterdam' },
};
const customers = planCustomers(demo);
const plan = (through, facts = storeFacts) =>
	planOrders(demo, { storeFacts: facts, products, customers, through: new Date(through) });
const DAY = 86_400_000;

test('the same inputs give the same plan', () => {
	assert.deepEqual(plan('2026-11-04T12:00:00Z'), plan('2026-11-04T12:00:00Z'));
	assert.deepEqual(planCustomers(demo), planCustomers(demo));
	assert.deepEqual(planCoupons(demo), planCoupons(demo));
});

test('a later through keeps every earlier order, and mid-day drops only later orders', () => {
	const through = Date.parse('2026-10-31T23:00:00Z');
	const before = plan(through);
	const after = new Map(plan(through + DAY).map((o) => [o.key, o]));
	assert.ok(after.size > before.length);
	for (const o of before) assert.deepEqual(after.get(o.key), o);

	const endOfDay = plan('2026-11-04T23:59:00Z', {
		us: { timeZone: 'UTC' },
		uk: { timeZone: 'UTC' },
		wholesale: { timeZone: 'UTC' },
		eu: { timeZone: 'UTC' },
	});
	const midDay = plan('2026-11-04T13:00:00Z', {
		us: { timeZone: 'UTC' },
		uk: { timeZone: 'UTC' },
		wholesale: { timeZone: 'UTC' },
		eu: { timeZone: 'UTC' },
	});
	const full = new Map(endOfDay.map((o) => [o.key, o]));
	const kept = new Set(midDay.map((o) => o.key));
	assert.ok(midDay.length < endOfDay.length);
	for (const o of midDay) assert.deepEqual(full.get(o.key), o);
	for (const o of endOfDay) {
		if (!kept.has(o.key))
			assert.ok(Date.parse(o.saleTimeUtc) > Date.parse('2026-11-04T13:00:00Z'), o.key);
	}
});

test('customers are forty, unique, on example.com, and every store has regulars', () => {
	assert.equal(customers.length, 40);
	for (const c of customers) {
		assert.match(c.email, /^[a-z0-9.-]+@example\.com$/);
		assert.match(c.username, /^[a-z0-9.-]+$/);
		assert.equal(c.billing.email, c.email);
		assert.equal(c.shipping.email, undefined);
		assert.equal(c.shipping.phone, undefined);
	}
	assert.equal(new Set(customers.map((c) => c.email)).size, 40);
	assert.equal(new Set(customers.map((c) => c.username)).size, 40);
	for (const store of demo.stores) {
		const own = customers.filter((c) => c.storeKey === store.key);
		assert.ok(own.length >= 4, store.key);
		for (const c of own) assert.equal(c.billing.company !== '', store.basketScale > 1, c.key);
	}
});

test('no planned value says probe or test', () => {
	const values = [];
	const walk = (v) => {
		if (v && typeof v === 'object') Object.values(v).forEach(walk);
		else values.push(String(v));
	};
	walk([customers, planCoupons(demo), plan('2026-11-04T12:00:00Z')]);
	walk(planCustomers(TARGETS['dev-free']));
	for (const v of values) assert.doesNotMatch(v, /probe|test/i);
});

test('every sale is inside opening hours on an open day in its zone, across both DST changes', () => {
	const facts = {
		us: { timeZone: 'America/Los_Angeles' },
		uk: { timeZone: 'Europe/Amsterdam' },
		wholesale: { timeZone: 'America/Los_Angeles' },
		eu: { timeZone: 'Europe/Amsterdam' },
	};
	const orders = plan('2026-11-04T23:00:00Z', facts);
	const stores = Object.fromEntries(demo.stores.map((s) => [s.key, s]));
	for (const day of ['2026-10-25', '2026-11-01', '2026-11-02']) {
		assert.ok(
			orders.some((o) => o.localDate === day && o.timeZone === 'Europe/Amsterdam'),
			day
		);
	}
	assert.ok(
		orders.some((o) => o.localDate === '2026-11-01' && o.timeZone === 'America/Los_Angeles')
	);
	for (const o of orders) {
		const store = stores[o.storeKey];
		const local = toZoned(new Date(o.saleTimeUtc), facts[o.storeKey].timeZone);
		assert.equal(local.localDate, o.localDate, o.key);
		assert.ok(
			local.hour >= store.openHour && local.hour < store.closeHour,
			`${o.key} ${local.hour}`
		);
		assert.ok(!store.closedWeekdays.includes(local.weekday), o.key);
		assert.ok(o.saleTimeUtc.endsWith('Z'));
	}
});

test('a thirty-day demo plan reads like a real month', () => {
	const orders = plan('2026-11-04T00:00:00Z', {});
	const { perStore } = summarise(orders);
	for (const store of demo.stores) {
		const s = perStore[store.key];
		const openDays = 30 - (store.closedWeekdays.length ? 4 : 0);
		const expected = store.ordersPerDay * openDays;
		assert.ok(
			Math.abs(s.orders - expected) <= expected * 0.2,
			`${store.key} ${s.orders} vs ${expected}`
		);
		assert.ok(
			s.cash / s.orders >= 0.35 && s.cash / s.orders <= 0.55,
			`${store.key} cash ${s.cash}/${s.orders}`
		);
		assert.ok(
			s.refunded / s.completed >= 0.01 && s.refunded / s.completed <= 0.06,
			`${store.key} refunds ${s.refunded}`
		);
		assert.ok(s.parked >= 1, `${store.key} parked`);
	}
});

test('the sale counter rises with sale time within a store', () => {
	const orders = plan('2026-11-04T23:00:00Z');
	for (const store of demo.stores) {
		const own = orders
			.filter((o) => o.storeKey === store.key)
			.sort((a, b) => a.saleTimeUtc.localeCompare(b.saleTimeUtc));
		for (let i = 1; i < own.length; i += 1)
			assert.ok(own[i].saleCounter > own[i - 1].saleCounter, own[i].key);
		assert.ok(own.every((o) => Number.isInteger(o.saleCounter) && o.saleCounter > 0));
	}
});

test('uuidFrom is shaped as a v4 uuid', () => {
	const re = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
	for (const text of ['', 'us-20261005-003', 'till:12', 'session:12:2026-10-05', 'Zoë'])
		assert.match(uuidFrom(text), re);
	assert.notEqual(uuidFrom('a'), uuidFrom('b'));
});

test('a catalogue of three products gives the same sale times as one of four', () => {
	const timesWith = (n) =>
		new Map(
			planOrders(demo, {
				storeFacts,
				products: products.slice(0, n),
				customers,
				through: new Date('2026-11-04T12:00:00Z'),
			}).map((o) => [o.key, o.saleTimeUtc])
		);
	const [three, four] = [timesWith(3), timesWith(4)];
	assert.ok(four.size > 0);
	assert.deepEqual(three, four);
});
