import { expect, test } from '@playwright/test';

import {
	formatCouponSweepCensus,
	PROBE_COUPON_CODE_LEAD,
	PROBE_COUPON_DESCRIPTION_LEAD,
	PROBE_COUPON_ORPHAN_AGE_MS,
	SWEEP_BUDGET_MS,
	sweepOrphanedProbeCoupons,
} from './coupon-probe';

import type { APIRequestContext } from '@playwright/test';

const STORE = 'https://store.test';
const NOW = Date.parse('2026-11-23T12:00:00Z');
const authorization = { transport: 'query', value: 'secret-token' } as const;

function probe(id: number, age = PROBE_COUPON_ORPHAN_AGE_MS + 60_000) {
	return {
		id,
		code: `${PROBE_COUPON_CODE_LEAD}0mi3k2v1a${id.toString(16).padStart(12, '0')}`,
		description: `${PROBE_COUPON_DESCRIPTION_LEAD} probe (safe to delete)`,
		date_created_gmt: new Date(NOW - age).toISOString().slice(0, 19),
	};
}

type Call = {
	method: 'get' | 'post' | 'delete';
	url: string;
	params?: Record<string, string>;
	data?: { delete: number[] };
};
type RequestOptions = Pick<Call, 'params' | 'data'>;

function fakeStore(
	initial: ReturnType<typeof probe>[],
	options: { refused?: number[]; failList?: boolean; listError?: Error } = {}
) {
	let records = [...initial];
	const calls: Call[] = [];
	const refused = new Set(options.refused);
	const response = (status: number, body: unknown, total = records.length) => ({
		ok: () => status >= 200 && status < 300,
		status: () => status,
		json: async () => body,
		headers: () => ({ 'x-wp-total': String(total) }),
	});
	const request = {
		get: async (url: string, { params = {}, data }: RequestOptions) => {
			calls.push({ method: 'get', url, params, data });
			expect(new URL(url).pathname).toBe('/wp-json/wc/v3/coupons');
			if (params.search && options.listError) throw options.listError;
			if (params.search && options.failList) return response(500, {});
			const matching = records.filter((record) => record.code.includes(params.search ?? ''));
			if (params.orderby === 'date' && params.order === 'asc') {
				matching.sort((a, b) => a.date_created_gmt.localeCompare(b.date_created_gmt));
			}
			const offset = Number(params.offset ?? 0);
			return response(
				200,
				matching.slice(offset, offset + Number(params.per_page)),
				matching.length
			);
		},
		post: async (url: string, { params, data }: RequestOptions) => {
			calls.push({ method: 'post', url, params, data });
			expect(new URL(url).pathname).toBe('/wp-json/wc/v3/coupons/batch');
			const entries = data!.delete.map((id) => {
				if (refused.has(id)) {
					return {
						id,
						error: { code: 'refused', message: 'Cannot delete', data: { status: 403 } },
					};
				}
				const coupon = records.find((record) => record.id === id)!;
				records = records.filter((record) => record.id !== id);
				return coupon;
			});
			return response(200, { delete: entries });
		},
		delete: async (url: string, { params, data }: RequestOptions) => {
			calls.push({ method: 'delete', url, params, data });
			return response(405, {});
		},
	} as unknown as APIRequestContext;
	return { request, calls, remaining: () => records };
}

test('drains orphans across more than one page with batch deletes', async () => {
	const orphans = Array.from({ length: 250 }, (_, i) => probe(i + 1));
	const survivors = [
		probe(251, 60_000),
		probe(252, 60_000),
		probe(253, 60_000),
		{ ...probe(254), code: 'zxmas', description: 'Christmas' },
		{ ...probe(255), code: 'summer', description: 'Summer sale' },
	];
	const store = fakeStore([...orphans, ...survivors]);
	const census = await sweepOrphanedProbeCoupons({
		request: store.request,
		storeUrl: STORE,
		authorization,
		now: () => NOW,
	});
	expect(store.remaining()).toEqual(survivors);
	const batches = store.calls.filter((call) => call.method === 'post');
	expect(batches).toHaveLength(3);
	for (const call of batches) expect(call.data!.delete.length).toBeLessThanOrEqual(100);
	expect(store.calls.some((call) => call.method === 'delete')).toBe(false);
	for (const call of store.calls) expect(call.params?.authorization).toBe(authorization.value);
	expect(census).toEqual({
		store: 'store.test',
		before: 255,
		probe: 253,
		orphans: 250,
		deleted: 250,
		failed: 0,
		after: 5,
		complete: true,
	});
});

test('keeps paging past a full page that holds no orphan', async () => {
	const merchants = Array.from({ length: 100 }, (_, i) => ({
		...probe(i + 1, PROBE_COUPON_ORPHAN_AGE_MS + 120_000),
		description: 'merchant coupon',
	}));
	const orphans = Array.from({ length: 5 }, (_, i) => probe(i + 101));
	const store = fakeStore([...merchants, ...orphans]);
	const census = await sweepOrphanedProbeCoupons({
		request: store.request,
		storeUrl: STORE,
		authorization,
		now: () => NOW,
	});
	const batches = store.calls.filter((call) => call.method === 'post');
	expect(batches.flatMap((call) => call.data!.delete)).toEqual(orphans.map((record) => record.id));
	expect(store.remaining()).toHaveLength(100);
	expect(
		store.remaining().some((record) => record.description.startsWith(PROBE_COUPON_DESCRIPTION_LEAD))
	).toBe(false);
	expect(census).toEqual({
		store: 'store.test',
		before: 105,
		probe: 5,
		orphans: 5,
		deleted: 5,
		failed: 0,
		after: 100,
		complete: true,
	});
});

test('counts refused batch entries as failed and does not loop on them', async () => {
	const coupons = Array.from({ length: 120 }, (_, i) => probe(i + 1));
	const refused = coupons.slice(0, 30);
	const store = fakeStore(coupons, { refused: refused.map((record) => record.id) });
	const census = await sweepOrphanedProbeCoupons({
		request: store.request,
		storeUrl: STORE,
		authorization,
		now: () => NOW,
	});
	expect(census).toEqual({
		store: 'store.test',
		before: 120,
		probe: 120,
		orphans: 120,
		deleted: 90,
		failed: 30,
		after: 30,
		complete: true,
	});
	expect(store.remaining()).toEqual(refused);
	const batches = store.calls.filter((call) => call.method === 'post');
	expect(batches).toHaveLength(2);
	expect(batches.flatMap((call) => call.data!.delete)).toEqual(coupons.map((record) => record.id));
});

test('stops on the time budget and reports an incomplete census', async () => {
	const store = fakeStore(Array.from({ length: 300 }, (_, i) => probe(i + 1)));
	let reads = 0;
	const census = await sweepOrphanedProbeCoupons({
		request: store.request,
		storeUrl: STORE,
		authorization,
		// Start and the first cutoff share NOW; each later read advances by a full budget.
		now: () => NOW + Math.max(0, reads++ - 1) * SWEEP_BUDGET_MS,
	});
	expect(census?.deleted).toBe(100);
	expect(census?.deleted).toBeLessThan(300);
	expect(census?.complete).toBe(false);
	expect(store.remaining()).toHaveLength(200);
});

test('a failing list read returns a census without deleting anything', async () => {
	const store = fakeStore([probe(1)], { failList: true });
	const census = await sweepOrphanedProbeCoupons({
		request: store.request,
		storeUrl: STORE,
		authorization,
		now: () => NOW,
	});
	expect(store.calls.filter((call) => call.method === 'post')).toEqual([]);
	expect(store.remaining()).toEqual([probe(1)]);
	// Rule 3: a failed list read is complete; only budget/round exhaustion is incomplete.
	expect(census).toEqual({
		store: 'store.test',
		before: 1,
		probe: 0,
		orphans: 0,
		deleted: 0,
		failed: 0,
		after: 1,
		complete: true,
	});
});

test('the census line names counts and never the authorization', async () => {
	const census = {
		store: 'store.test',
		before: 255,
		probe: 253,
		orphans: 250,
		deleted: 250,
		failed: 0,
		after: 5,
		complete: true,
	};
	expect(formatCouponSweepCensus(census)).toBe(
		'[coupon-sweep] store.test before=255 probe=253 orphans=250 deleted=250 failed=0 after=5 complete=true'
	);
	expect(formatCouponSweepCensus({ ...census, before: null, after: null, complete: false })).toBe(
		'[coupon-sweep] store.test before=? probe=253 orphans=250 deleted=250 failed=0 after=? complete=false'
	);
	const messages: string[] = [];
	const originalLog = console.log;
	const logSpy = (...args: unknown[]) => {
		messages.push(args.join(' '));
	};
	console.log = logSpy;
	try {
		const store = fakeStore([probe(1)]);
		await sweepOrphanedProbeCoupons({
			request: store.request,
			storeUrl: STORE,
			authorization,
			now: () => NOW,
		});
		const failing = fakeStore([], {
			listError: new Error(
				`Failed ${STORE}/wp-json/wc/v3/coupons?authorization=secret-token\nAuthorization: secret-token`
			),
		});
		expect(
			await sweepOrphanedProbeCoupons({
				request: failing.request,
				storeUrl: STORE,
				authorization,
				now: () => NOW,
			})
		).toBeNull();
		expect(messages).toHaveLength(2);
		expect(messages[0]).toBe(
			'[coupon-sweep] store.test before=1 probe=1 orphans=1 deleted=1 failed=0 after=0 complete=true'
		);
		expect(messages[1]).toBe('[coupon-sweep] store.test sweep failed: Failed [request]');
		expect(messages.join('\n')).not.toContain('secret-token');
	} finally {
		console.log = originalLog;
	}
});
