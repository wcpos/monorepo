/**
 * The showcase plan: pure and deterministic. The only clock is `through`.
 *
 * Each store and day draws from its own rng, so a later day, or a later
 * `through`, never changes an order already planned.
 */
import { createHash } from 'node:crypto';

import {
	ADDRESSES,
	COMPANY_SUFFIXES,
	COUPONS,
	CUSTOMER_COUNT,
	MIN_CUSTOMERS_PER_STORE,
	NAMES,
	REFUND_REASONS,
} from './targets.mjs';

/** Day volume weight by weekday, Sunday first. */
const WEEKDAY_WEIGHT = [0.7, 0.8, 0.8, 0.8, 1.0, 1.0, 1.3];
/** Lines per basket, weighted to one and two. */
const LINE_COUNT_WEIGHTS = [0.42, 0.33, 0.15, 0.1];
const CASH_SHARE = 0.45;
const NAMED_SHARE = 0.45;
const COUPON_SHARE = 0.07;
const PARKED_FIRST_ORDER_SHARE = 0.12;
const REFUND_SHARE = 0.03;
const DOUBLE_QUANTITY_SHARE = 0.2;
/** Cashier and register indices are drawn from 0..8; apply takes them modulo what exists. */
const SHIFT_INDEX_SPAN = 9;

/** FNV-1a, 32 bit, over the UTF-8 bytes of `text`. */
export function hashSeed(text) {
	let h = 0x811c9dc5;
	for (const byte of Buffer.from(String(text), 'utf8')) {
		h ^= byte;
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h >>> 0;
}

/** mulberry32 seeded by hashSeed(text). */
export function rng(text) {
	let a = hashSeed(text);
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** sha256 of `text`, shaped as a v4 uuid. */
export function uuidFrom(text) {
	const h = createHash('sha256').update(String(text)).digest('hex').slice(0, 32).split('');
	h[12] = '4';
	h[16] = '89ab'[parseInt(h[16], 16) & 3];
	const s = h.join('');
	return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

const formatters = new Map();
function zoneParts(date, timeZone) {
	if (!formatters.has(timeZone)) {
		formatters.set(
			timeZone,
			new Intl.DateTimeFormat('en-US', {
				timeZone,
				hourCycle: 'h23',
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit',
			})
		);
	}
	const v = {};
	for (const p of formatters.get(timeZone).formatToParts(date)) v[p.type] = p.value;
	return v;
}

/** Local wall-clock parts of `date` in `timeZone`: { localDate, hour, minute, second, weekday }. */
export function toZoned(date, timeZone) {
	const v = zoneParts(date, timeZone);
	const localDate = `${v.year}-${v.month}-${v.day}`;
	return {
		localDate,
		hour: +v.hour,
		minute: +v.minute,
		second: +v.second,
		weekday: weekdayOf(localDate),
	};
}

function offsetMs(date, timeZone) {
	const v = zoneParts(date, timeZone);
	const wall = Date.UTC(+v.year, +v.month - 1, +v.day, +v.hour, +v.minute, +v.second);
	return wall - Math.floor(date.getTime() / 1000) * 1000;
}

/** The UTC instant of a local wall-clock time. Two passes, so DST days land right. */
export function zonedToUtc(localDate, hour, minute, timeZone) {
	const [y, m, d] = localDate.split('-').map(Number);
	const wall = Date.UTC(y, m - 1, d, hour, minute);
	const first = wall - offsetMs(new Date(wall), timeZone);
	return new Date(wall - offsetMs(new Date(first), timeZone));
}

function weekdayOf(localDate) {
	const [y, m, d] = localDate.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** 'YYYY-MM-DD' from windowStart to the local day of `through`, inclusive. */
export function localDays(windowStart, through, timeZone) {
	const last = toZoned(through, timeZone).localDate;
	const days = [];
	const [y, m, d] = windowStart.split('-').map(Number);
	for (let t = Date.UTC(y, m - 1, d); ; t += 86_400_000) {
		const day = new Date(t).toISOString().slice(0, 10);
		if (day > last) return days;
		days.push(day);
	}
}

const ascii = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\s']/g, '');
const pad = (n, width) => String(n).padStart(width, '0');

function phoneFor(region, row, n) {
	if (region === 'us') return `(${row[5]}) 555-01${pad(n, 2)}`;
	if (region === 'uk') return `020 7946 0${pad(n, 3)}`;
	return `+31 20 555 01${pad(n, 2)}`;
}

/** Seats per store by largest remainder over ordersPerDay, then topped up to the minimum. */
function seatsPerStore(stores) {
	const total = stores.reduce((sum, s) => sum + s.ordersPerDay, 0);
	const exact = stores.map((s) => (CUSTOMER_COUNT * s.ordersPerDay) / total);
	const seats = exact.map(Math.floor);
	const byRemainder = exact
		.map((x, i) => [x - Math.floor(x), i])
		.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
	for (let k = 0; seats.reduce((a, b) => a + b, 0) < CUSTOMER_COUNT; k += 1)
		seats[byRemainder[k][1]] += 1;
	for (let i = 0; i < seats.length; i += 1) {
		while (seats[i] < MIN_CUSTOMERS_PER_STORE) {
			const donor = seats.indexOf(Math.max(...seats));
			seats[donor] -= 1;
			seats[i] += 1;
		}
	}
	return seats;
}

export function planCustomers(target) {
	const seats = seatsPerStore(target.stores);
	const customers = [];
	target.stores.forEach((store, s) => {
		for (let j = 0; j < seats[s]; j += 1) {
			const n = customers.length + 1;
			const [first_name, last_name] = NAMES[n - 1];
			const rows = ADDRESSES[store.region];
			const row = rows[j % rows.length];
			const username = `${ascii(first_name)}.${ascii(last_name)}`;
			const email = `${username}@example.com`;
			const company =
				store.basketScale > 1
					? `${last_name} ${COMPANY_SUFFIXES[j % COMPANY_SUFFIXES.length]}`
					: '';
			const address = {
				first_name,
				last_name,
				company,
				address_1: row[0],
				city: row[1],
				state: row[2],
				postcode: row[3],
				country: row[4],
			};
			customers.push({
				key: `customer-${pad(n, 2)}`,
				storeKey: store.key,
				first_name,
				last_name,
				email,
				username,
				billing: { ...address, email, phone: phoneFor(store.region, row, n) },
				shipping: { ...address },
			});
		}
	});
	return customers;
}

export function planCoupons(target) {
	const named = new Set(target.stores.flatMap((s) => s.couponCodes));
	return COUPONS.filter((c) => named.has(c.code)).map((c) => ({ ...c }));
}

function pickWeighted(r, weights) {
	const total = weights.reduce((a, b) => a + b, 0);
	let x = r() * total;
	for (let i = 0; i < weights.length; i += 1) {
		x -= weights[i];
		if (x < 0) return i;
	}
	return weights.length - 1;
}

/** Hour weights across opening hours: a lunch peak at 12-13 and an after-work peak at 16-17. */
function hourWeights(openHour, closeHour) {
	const weights = [];
	for (let h = openHour; h < closeHour; h += 1) {
		const mid = h + 0.5;
		weights.push(
			1 + 2.2 * Math.exp(-((mid - 12.75) ** 2) / 1.5) + 1.6 * Math.exp(-((mid - 16.75) ** 2) / 1.2)
		);
	}
	return weights;
}

function pickLines(r, products, basketScale) {
	// Every line takes its draws even when the catalogue can't fill it, so a thin catalogue can't move the day's sale times.
	const want = pickWeighted(r, LINE_COUNT_WEIGHTS) + 1;
	const used = new Set();
	const lines = [];
	for (let n = 0; n < want; n += 1) {
		// Two draws multiplied left to right, as before, so the index rounds exactly as it did.
		const a = r();
		const b = r();
		const double = r() < DOUBLE_QUANTITY_SHARE;
		if (lines.length >= products.length) continue;
		let index = Math.floor(products.length * a * b);
		while (used.has(index)) index = (index + 1) % products.length;
		used.add(index);
		lines.push({ productId: products[index].id, quantity: (double ? 2 : 1) * basketScale });
	}
	return lines;
}

function planDay(store, localDate, dayIndex, timeZone, products, regulars) {
	if (store.closedWeekdays.includes(weekdayOf(localDate))) return [];
	const r = rng(`${store.key}:${localDate}`);
	const count = Math.round(store.ordersPerDay * WEEKDAY_WEIGHT[weekdayOf(localDate)]);
	const shifts = [0, 1].map(() => ({
		cashierIndex: Math.floor(r() * SHIFT_INDEX_SPAN),
		registerIndex: Math.floor(r() * SHIFT_INDEX_SPAN),
	}));
	const firstParked = r() < PARKED_FIRST_ORDER_SHARE;
	const weights = hourWeights(store.openHour, store.closeHour);
	const halfway = (store.openHour + store.closeHour) / 2;
	const drafts = [];
	for (let k = 0; k < count; k += 1) {
		const hour = store.openHour + pickWeighted(r, weights);
		const minute = Math.floor(r() * 60);
		const second = Math.floor(r() * 60);
		const cash = r() < CASH_SHARE;
		const named = r() < NAMED_SHARE && regulars.length > 0;
		const regular = regulars[Math.floor(regulars.length * r() * r())];
		const lines = pickLines(r, products, store.basketScale);
		const couponRoll = r();
		const couponPick = r();
		const refundRoll = r();
		const reason = REFUND_REASONS[Math.floor(r() * REFUND_REASONS.length)];
		const time = zonedToUtc(localDate, hour, minute, timeZone).getTime() + second * 1000;
		drafts.push({
			k,
			time,
			hour,
			cash,
			customerKey: named ? regular.key : null,
			lines,
			couponRoll,
			couponPick,
			refundRoll,
			reason,
		});
	}
	drafts.sort((a, b) => a.time - b.time || a.k - b.k);
	return drafts.map((d, seq) => {
		const parked = seq === 0 && firstParked;
		const coupon = !parked && store.couponCodes.length > 0 && d.couponRoll < COUPON_SHARE;
		const shift = shifts[d.hour < halfway ? 0 : 1];
		return {
			key: `${store.key}-${localDate.replaceAll('-', '')}-${pad(seq, 3)}`,
			storeKey: store.key,
			storeId: store.id,
			currency: store.currency,
			localDate,
			saleTimeUtc: new Date(d.time).toISOString(),
			timeZone,
			status: parked ? 'pos-open' : 'completed',
			paymentMethod: d.cash ? 'pos_cash' : 'pos_card',
			paymentTitle: d.cash ? 'Cash' : 'Card',
			customerKey: d.customerKey,
			lines: d.lines,
			couponCode: coupon
				? store.couponCodes[Math.floor(d.couponPick * store.couponCodes.length)]
				: null,
			refund:
				!parked && d.refundRoll < REFUND_SHARE
					? { lineIndex: 0, quantity: 1, reason: d.reason }
					: null,
			cashierIndex: shift.cashierIndex,
			registerIndex: shift.registerIndex,
			saleCounter: dayIndex * 1000 + seq + 1,
		};
	});
}

export function planOrders(target, { storeFacts, products, customers, through }) {
	const sorted = [...products].sort((a, b) => a.id - b.id);
	const orders = [];
	for (const store of target.stores) {
		const timeZone = storeFacts[store.key]?.timeZone ?? 'UTC';
		const regulars = customers.filter((c) => c.storeKey === store.key);
		localDays(target.windowStart, through, timeZone).forEach((localDate, i) => {
			for (const order of planDay(store, localDate, i + 1, timeZone, sorted, regulars)) {
				if (Date.parse(order.saleTimeUtc) <= through.getTime()) orders.push(order);
			}
		});
	}
	return orders;
}

/** Cash handed over: 60% exact, 40% rounded up to the next 5. Two decimals. */
export function cashTendered(key, total) {
	const cents = Math.round(Number(total) * 100);
	if (rng(`tender:${key}`)() < 0.6) return (cents / 100).toFixed(2);
	return ((Math.floor(cents / 500) + 1) * 5).toFixed(2);
}

export function summarise(orders) {
	const perStore = {};
	for (const o of orders) {
		const s = (perStore[o.storeKey] ??= {
			orders: 0,
			completed: 0,
			parked: 0,
			refunded: 0,
			cash: 0,
			card: 0,
			named: 0,
			coupons: 0,
		});
		s.orders += 1;
		s[o.status === 'completed' ? 'completed' : 'parked'] += 1;
		if (o.refund) s.refunded += 1;
		s[o.paymentMethod === 'pos_cash' ? 'cash' : 'card'] += 1;
		if (o.customerKey) s.named += 1;
		if (o.couponCode) s.coupons += 1;
	}
	return { perStore };
}
