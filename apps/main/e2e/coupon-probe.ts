import { log } from '@wcpos/utils/logger';

import { type StoreAuthorization, storeRequestOptions } from './probe-credential';

import type { APIRequestContext, APIResponse } from '@playwright/test';

/**
 * Disposable coupons for the coupon specs, and the sweep that keeps them from piling up.
 *
 * Every probe coupon's description starts with this lead and its code with the search-probe
 * token (`zx…`). The fixture that creates one deletes it in `finally`, but a worker killed by
 * a timeout never reaches `finally`, and a delete that 401s is swallowed on purpose (a teardown
 * error must never fail a test). By 2026-11-02 dev-free carried 3,990 of them — 40 pages of
 * coupons that the 2.0 startup sync paged through on every run, starving the filtered product
 * window the category-filter spec waits on and the quiet the perf specs need before they
 * measure (main run 41536443936, shards 2/4/6, free only). So, like
 * `sweepOrphanedProductProbes`, each fixture sweeps the previous runs' orphans before it mints
 * its own.
 */
export const PROBE_COUPON_DESCRIPTION_LEAD = 'wcpos-e2e coupon';

/** Every probe code starts with `mintSearchProbeToken`'s lead; WC's `search` matches the code. */
export const PROBE_COUPON_CODE_LEAD = 'zx';

/** Orphans older than this are swept; a live run is never this long. */
export const PROBE_COUPON_ORPHAN_AGE_MS = 2 * 60 * 60 * 1_000;

/** One wc/v3 page per sweep: the leak is a few coupons per interrupted run, never hundreds. */
const SWEEP_PAGE_SIZE = 100;

export async function couponRequest(
	request: APIRequestContext,
	method: 'get' | 'post' | 'delete',
	storeUrl: string,
	id: number | undefined,
	options: Record<string, unknown>
): Promise<APIResponse> {
	const base = storeUrl.replace(/\/+$/, '');
	const path = id === undefined ? 'coupons' : `coupons/${id}`;
	const pretty = await request[method](`${base}/wp-json/wc/v3/${path}`, options);
	if (pretty.status() !== 404) return pretty;
	return request[method](`${base}/?rest_route=/wc/v3/${path}`, options);
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
		const code = typeof record?.code === 'string' ? record.code : '';
		const description = typeof record?.description === 'string' ? record.description : '';
		const createdGmt = typeof record?.date_created_gmt === 'string' ? record.date_created_gmt : '';
		if (
			Number.isInteger(id) &&
			id > 0 &&
			code.startsWith(PROBE_COUPON_CODE_LEAD) &&
			description.startsWith(PROBE_COUPON_DESCRIPTION_LEAD) &&
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
}): Promise<void> {
	const { request, storeUrl, authorization } = options;
	try {
		const auth = storeRequestOptions(authorization);
		const response = await couponRequest(request, 'get', storeUrl, undefined, {
			...auth,
			params: {
				...auth.params,
				search: PROBE_COUPON_CODE_LEAD,
				per_page: String(SWEEP_PAGE_SIZE),
				orderby: 'date',
				order: 'asc',
			},
		});
		if (!response.ok()) throw new Error(`HTTP ${response.status()}`);
		const ids = selectOrphanedProbeCoupons(await response.json(), Date.now());
		for (const id of ids) {
			await couponRequest(request, 'delete', storeUrl, id, {
				...auth,
				params: { ...auth.params, force: 'true' },
			}).catch(() => {});
		}
		if (ids.length > 0) log.info(`[coupon-probe] swept ${ids.length} orphaned probe coupon(s)`);
	} catch {
		log.warn('[coupon-probe] orphan coupon sweep failed');
	}
}
