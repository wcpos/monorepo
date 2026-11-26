import { randomUUID } from 'node:crypto';

import { type StoreAuthorization, storeRequestOptions } from './probe-credential';
import { mintSearchProbeToken } from './search-probe';

import type { APIRequestContext, APIResponse } from '@playwright/test';

/**
 * Disposable coupons for the coupon specs, and the sweep that keeps them from piling up.
 *
 * Every probe coupon's description starts with this lead and its code with the search-probe
 * token (`zx…`). The fixture that creates one deletes it in `finally`, but a worker killed by
 * a timeout never reaches `finally`, and a failed teardown delete is logged, never thrown (a
 * teardown error must never fail a test). Teardown used the setup-time writer token, which a
 * worker-scoped coupon outlives (30 min), so its delete 401ed silently; it now renews first. By 2026-11-02 dev-free carried 3,990 of them — 40 pages of
 * coupons that the 2.0 startup sync paged through on every run, starving the filtered product
 * window the category-filter spec waits on and the quiet the perf specs need before they
 * measure (main run 41536443936, shards 2/4/6, free only). So each CI run sweeps the previous
 * runs' orphans once, from shard index 0's `globalSetup`, at a 20-minute floor. The sweep reads
 * every page of `zx` coupons within its budget, including pages with nothing to delete,
 * batch-deletes orphans and prints a census line to stdout.
 */
export const PROBE_COUPON_DESCRIPTION_LEAD = 'wcpos-e2e coupon';

/** Every probe code starts with `mintSearchProbeToken`'s lead; WC's `search` matches the code. */
export const PROBE_COUPON_CODE_LEAD = 'zx';

/**
 * The exact shape `mintProbeCouponCode` mints from `mintSearchProbeToken` (search-probe.ts):
 * `zx` + base-36 worker index (1-3 chars) + base-36 `Date.now()` (8 chars until 2059) +
 * 12 lowercase hex characters.
 */
export const PROBE_COUPON_CODE_PATTERN = /^zx[0-9a-z]{9,12}[0-9a-f]{12}$/;

/** Orphans older than this are swept: 20 minutes, the desk's floor, so a concurrent run's fresh probe survives. */
export const PROBE_COUPON_ORPHAN_AGE_MS = 20 * 60 * 1_000;

/** Each sweep round reads one wc/v3 page and batch-deletes at most this many orphans. */
const SWEEP_PAGE_SIZE = 100;

/** Rounds per sweep: one page read plus one batch delete each. Bounds a sweep at 5,000 coupons. */
export const SWEEP_MAX_ROUNDS = 50;
/** Stop starting rounds before the fixture's 180 s timeout; the next sweep carries on. */
export const SWEEP_BUDGET_MS = 90_000;

export interface CouponSweepCensus {
	store: string;
	before: number | null;
	probe: number;
	orphans: number;
	deleted: number;
	failed: number;
	after: number | null;
	complete: boolean;
}

/** One stdout line of counts, without credentials. */
export function formatCouponSweepCensus(census: CouponSweepCensus): string {
	return `[coupon-sweep] ${census.store} before=${census.before ?? '?'} probe=${census.probe} orphans=${census.orphans} deleted=${census.deleted} failed=${census.failed} after=${census.after ?? '?'} complete=${census.complete}`;
}

export async function couponRequest(
	request: APIRequestContext,
	method: 'get' | 'post' | 'delete',
	storeUrl: string,
	id: number | 'batch' | undefined,
	options: Record<string, unknown>
): Promise<APIResponse> {
	const base = storeUrl.replace(/\/+$/, '');
	const path = id === undefined ? 'coupons' : `coupons/${id}`;
	const pretty = await request[method](`${base}/wp-json/wc/v3/${path}`, options);
	if (pretty.status() !== 404) return pretty;
	return request[method](`${base}/?rest_route=/wc/v3/${path}`, options);
}

/** A probe coupon code for one worker; always matches `PROBE_COUPON_CODE_PATTERN`. */
export function mintProbeCouponCode(workerIndex: number): string {
	return `${mintSearchProbeToken(workerIndex)}${randomUUID().slice(0, 4)}`.toLowerCase();
}

/** Once per CI run; local runs never delete store data. */
export function sweepsProbeCoupons(shardIndex: number, ci: string | undefined): boolean {
	return Boolean(ci) && shardIndex === 0;
}

function isProbeCoupon(record: Record<string, unknown> | null): boolean {
	const code = typeof record?.code === 'string' ? record.code : '';
	const description = typeof record?.description === 'string' ? record.description : '';
	return (
		PROBE_COUPON_CODE_PATTERN.test(code) && description.startsWith(PROBE_COUPON_DESCRIPTION_LEAD)
	);
}

/**
 * The ids of the probe coupons in a wc/v3 list that are old enough to be another run's
 * leftovers. A merchant's own coupon never carries the description lead, and a coupon made
 * minutes ago may belong to a run still going.
 */
export function selectOrphanedProbeCoupons(records: unknown, nowMs: number): number[] {
	if (!Array.isArray(records)) return [];
	const cutoff = nowMs - PROBE_COUPON_ORPHAN_AGE_MS;
	const ids: number[] = [];
	for (const value of records) {
		const record =
			value && typeof value === 'object' && !Array.isArray(value)
				? (value as Record<string, unknown>)
				: null;
		const id = Number(record?.id ?? 0);
		const createdGmt = typeof record?.date_created_gmt === 'string' ? record.date_created_gmt : '';
		if (
			Number.isInteger(id) &&
			id > 0 &&
			isProbeCoupon(record) &&
			Date.parse(`${createdGmt}Z`) < cutoff
		) {
			ids.push(id);
		}
	}
	return ids;
}

/** Best-effort cleanup for probe coupons left behind by interrupted runs. Never fails a test. */
export async function sweepOrphanedProbeCoupons(options: {
	request: APIRequestContext;
	storeUrl: string;
	authorization: StoreAuthorization;
	now?: () => number;
}): Promise<CouponSweepCensus | null> {
	const { request, storeUrl, authorization, now = Date.now } = options;
	let store = '';
	try {
		store = new URL(storeUrl).host;
		const start = now();
		const auth = storeRequestOptions(authorization);
		const beforeResponse = await couponRequest(request, 'get', storeUrl, undefined, {
			...auth,
			params: { ...auth.params, per_page: '1' },
		});
		const beforeTotal = Number(beforeResponse.headers()['x-wp-total'] ?? NaN);
		const before = beforeResponse.ok() && Number.isFinite(beforeTotal) ? beforeTotal : null;
		const census: CouponSweepCensus = {
			store,
			before,
			probe: 0,
			orphans: 0,
			deleted: 0,
			failed: 0,
			after: before,
			complete: true,
		};
		let offset = 0;
		for (let round = 0; ; round++) {
			if (round >= SWEEP_MAX_ROUNDS || (round > 0 && now() - start >= SWEEP_BUDGET_MS)) {
				census.complete = false;
				break;
			}
			const response = await couponRequest(request, 'get', storeUrl, undefined, {
				...auth,
				params: {
					...auth.params,
					search: PROBE_COUPON_CODE_LEAD,
					per_page: String(SWEEP_PAGE_SIZE),
					orderby: 'date',
					order: 'asc',
					offset: String(offset),
				},
			});
			if (!response.ok()) break;
			const records = await response.json();
			if (!Array.isArray(records)) break;
			census.probe += records.filter(isProbeCoupon).length;
			const ids = selectOrphanedProbeCoupons(records, now());
			census.orphans += ids.length;
			let deletedThisRound = 0;
			if (ids.length > 0) {
				try {
					const batch = await couponRequest(request, 'post', storeUrl, 'batch', {
						...auth,
						data: { delete: ids },
					});
					if (batch.ok()) {
						const body = (await batch.json()) as { delete: { error?: unknown }[] };
						deletedThisRound = body.delete.filter((entry) => !entry.error).length;
					}
				} catch {
					// Every id in a failed batch counts as failed below.
				}
			}
			census.deleted += deletedThisRound;
			census.failed += ids.length - deletedThisRound;
			offset += records.length - deletedThisRound;
			if (records.length < SWEEP_PAGE_SIZE) break;
		}
		if (census.deleted > 0) {
			const afterResponse = await couponRequest(request, 'get', storeUrl, undefined, {
				...auth,
				params: { ...auth.params, per_page: '1' },
			});
			const afterTotal = Number(afterResponse.headers()['x-wp-total'] ?? NaN);
			census.after = afterResponse.ok() && Number.isFinite(afterTotal) ? afterTotal : null;
		}
		console.log(formatCouponSweepCensus(census));
		return census;
	} catch (error) {
		const message = (error instanceof Error ? error.message : String(error))
			.split('\n')[0]
			.replace(/https?:\/\/\S+/g, '[request]')
			.replaceAll(authorization.value.replace(/^Bearer\s+/i, ''), '[redacted]');
		console.log(`[coupon-sweep] ${store} sweep failed: ${message}`);
		return null;
	}
}
