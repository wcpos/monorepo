import type { APIRequestContext, Page } from '@playwright/test';

/**
 * E2E order teardown — finalize test-created orders instead of leaving pos-open carts.
 *
 * The problem: specs that add-to-cart / save-to-server / checkout push orders to the
 * server. Every such order is created server-side in the `pos-open` state (an open
 * cart). Specs that don't complete a real checkout abandon that cart, so pos-open
 * orders pile up on the shared dev store (thousands over time).
 *
 * The fix: capture every server order id a spec creates (from the push response),
 * then in teardown transition each STILL-OPEN one to a terminal status so it is a
 * normal handled order rather than a lingering cart.
 *
 * Terminal status = `cancelled`. These are never-paid abandoned carts; marking them
 * `completed` would fabricate fake SALES in the store's reports and decrement stock
 * catalog-wide (the store we test against). `cancelled` is the honest terminal state
 * and restores any stock the order reserved. A spec that genuinely completed a
 * checkout leaves its order in `completed`/`processing`/etc. — teardown re-checks the
 * LIVE status and only finalizes orders still in `pos-open`, so a real test sale is
 * never cancelled.
 *
 * Auth: teardown reuses the SAME credentials/transport the app itself sends (captured
 * by `captureStoreAuthorization` and shaped by `storeRequestOptions` in fixtures.ts),
 * so it works for both header-JWT and `use_jwt_as_param` stores without a second login.
 *
 * Robustness: teardown is strictly best-effort. Every failure is logged and swallowed
 * — a teardown error must NEVER fail the test (mirrors the route-handler-never-rethrow
 * lesson from #997/#1024). The pure decision functions are exported for unit testing.
 */

/**
 * Out-of-band request auth, as produced by `storeRequestOptions(storeAuthorization())`
 * in fixtures.ts: the app's own store credentials in the app's own transport.
 */
export interface StoreRequestAuth {
	headers: Record<string, string>;
	params: Record<string, string>;
}

/**
 * Order ids hardcoded as E2E fixtures that must never be finalized. Currently there
 * are no order ids hardcoded in the specs; 70954 is retained defensively because it
 * has been used as a manual fixture on dev-next. Add any spec-referenced order id
 * here so teardown skips it.
 */
export const RETAINED_FIXTURE_ORDER_IDS: ReadonlySet<number> = new Set([70954]);

/**
 * Order statuses that mark a lingering, unfinished cart safe to finalize in teardown.
 * Only `pos-open` — everything else is a genuine/handled order and is left as-is.
 */
export const FINALIZE_FROM_STATUSES: ReadonlySet<string> = new Set(['pos-open']);

/** The terminal status a finalized (abandoned) test cart is transitioned to. */
export const TEARDOWN_TERMINAL_STATUS = 'cancelled';

/** How many order ids to update per batch request (politeness + payload size). */
const BATCH_SIZE = 50;

export interface OrderStatusRecord {
	id: number;
	status: string;
}

/**
 * Extract a server order id from a `POST …/push/orders` response body. The push
 * surface returns either a bare wc/v3-shaped record (`{ id, … }`) or an enveloped
 * shape (`{ document: { id, … } }` / `{ record: { id, … } }`). Returns null when no
 * positive integer id is present.
 */
export function extractOrderIdFromPushBody(body: unknown): number | null {
	if (!body || typeof body !== 'object') return null;
	const record = body as Record<string, unknown>;
	const nested = (key: string): unknown => (record[key] as Record<string, unknown> | undefined)?.id;
	const candidates: unknown[] = [record.id, nested('document'), nested('record'), nested('data')];
	for (const candidate of candidates) {
		const id = typeof candidate === 'string' ? Number(candidate) : candidate;
		if (typeof id === 'number' && Number.isInteger(id) && id > 0) return id;
	}
	return null;
}

/**
 * Extract the DISPLAYED order number from a push response body (same bare/enveloped
 * shapes as the id). Sequential-order-number plugins make `number` differ from `id`,
 * and the Orders table renders `number` — search assertions must use it. Returns
 * null when absent so callers can fall back to the id.
 */
export function extractOrderNumberFromPushBody(body: unknown): string | null {
	if (!body || typeof body !== 'object') return null;
	const record = body as Record<string, unknown>;
	const nested = (key: string): unknown =>
		(record[key] as Record<string, unknown> | undefined)?.number;
	const candidates: unknown[] = [
		record.number,
		nested('document'),
		nested('record'),
		nested('data'),
	];
	for (const candidate of candidates) {
		if (typeof candidate === 'number' && Number.isFinite(candidate)) return String(candidate);
		if (typeof candidate === 'string' && candidate.trim() !== '') return candidate.trim();
	}
	return null;
}

/** True when an order in this status is a lingering cart that teardown should finalize. */
export function shouldFinalizeStatus(status: unknown): boolean {
	return typeof status === 'string' && FINALIZE_FROM_STATUSES.has(status);
}

/**
 * Given the LIVE status of each captured order, decide which ids to finalize:
 * drop retained fixtures, then keep only the ones still in a finalize-able status.
 */
export function selectOrdersToFinalize(
	orders: readonly OrderStatusRecord[],
	retain: ReadonlySet<number> = RETAINED_FIXTURE_ORDER_IDS
): number[] {
	const seen = new Set<number>();
	const result: number[] = [];
	for (const order of orders) {
		if (retain.has(order.id) || seen.has(order.id)) continue;
		if (!shouldFinalizeStatus(order.status)) continue;
		seen.add(order.id);
		result.push(order.id);
	}
	return result;
}

/** Split an array into fixed-size chunks. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
	const chunks: T[][] = [];
	const step = Math.max(1, size);
	for (let i = 0; i < items.length; i += step) {
		chunks.push(items.slice(i, i + step));
	}
	return chunks;
}

/** The namespaced wcpos v1 REST base for a store, e.g. https://shop/wp-json/wcpos/v1. */
function wcposV1Base(storeUrl: string): string {
	return `${storeUrl.replace(/\/+$/, '')}/wp-json/wcpos/v1`;
}

/** Fetch the current server status of the given order ids. Best-effort: [] on failure. */
async function fetchOrderStatuses(
	request: APIRequestContext,
	storeUrl: string,
	auth: StoreRequestAuth,
	ids: readonly number[]
): Promise<OrderStatusRecord[]> {
	const records: OrderStatusRecord[] = [];
	for (const batch of chunk(ids, BATCH_SIZE)) {
		try {
			const response = await request.get(`${wcposV1Base(storeUrl)}/orders`, {
				headers: auth.headers,
				params: {
					...auth.params,
					wcpos: '1',
					include: batch.join(','),
					per_page: batch.length,
					_fields: 'id,status',
					orderby: 'include',
				},
			});
			if (!response.ok()) {
				console.warn(`[order-cleanup] status fetch failed: HTTP ${response.status()}`);
				continue;
			}
			const body = (await response.json()) as unknown;
			if (Array.isArray(body)) {
				for (const item of body) {
					if (item && typeof item === 'object' && 'id' in item && 'status' in item) {
						records.push({
							id: Number((item as { id: unknown }).id),
							status: String((item as { status: unknown }).status),
						});
					}
				}
			}
		} catch (error) {
			console.warn('[order-cleanup] status fetch threw:', error);
		}
	}
	return records;
}

export interface FinalizeResult {
	cancelled: number;
	/** Captured orders left untouched because they were already handled (not pos-open). */
	leftHandled: number;
	failed: number;
	skippedFixtures: number;
}

/**
 * Finalize the given test-created order ids: transition every one still in a
 * finalize-able status (pos-open) to `cancelled`. Orders already handled (completed /
 * processing / etc.) and retained fixtures are left as-is.
 *
 * Strictly best-effort — logs and swallows every failure, never throws.
 */
export async function finalizeCreatedOrders(
	request: APIRequestContext,
	storeUrl: string,
	orderIds: Iterable<number>,
	auth: StoreRequestAuth | null,
	options: { retain?: ReadonlySet<number> } = {}
): Promise<FinalizeResult> {
	const retain = options.retain ?? RETAINED_FIXTURE_ORDER_IDS;
	const result: FinalizeResult = { cancelled: 0, leftHandled: 0, failed: 0, skippedFixtures: 0 };

	const unique = new Set<number>();
	for (const id of orderIds) {
		if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) continue;
		if (retain.has(id)) {
			result.skippedFixtures += 1;
			continue;
		}
		unique.add(id);
	}
	if (unique.size === 0) return result;

	const ids = [...unique];
	if (!auth || (!auth.headers.Authorization && !auth.params.authorization)) {
		console.warn(
			`[order-cleanup] no store authorization captured; skipping finalize of ${ids.length} order(s)`
		);
		return result;
	}

	try {
		const statuses = await fetchOrderStatuses(request, storeUrl, auth, ids);
		const toCancel = selectOrdersToFinalize(statuses, retain);
		result.leftHandled = statuses.length - toCancel.length;
		if (toCancel.length === 0) {
			console.log(`[order-cleanup] no pos-open orders to finalize (checked ${statuses.length})`);
			return result;
		}

		for (const batch of chunk(toCancel, BATCH_SIZE)) {
			try {
				const response = await request.post(`${wcposV1Base(storeUrl)}/orders/batch`, {
					headers: auth.headers,
					params: { ...auth.params, wcpos: '1' },
					data: { update: batch.map((id) => ({ id, status: TEARDOWN_TERMINAL_STATUS })) },
				});
				if (!response.ok()) {
					console.warn(`[order-cleanup] batch finalize failed: HTTP ${response.status()}`);
					result.failed += batch.length;
					continue;
				}
				const body = (await response.json().catch(() => null)) as { update?: unknown[] } | null;
				const updated = Array.isArray(body?.update) ? body!.update : [];
				for (const item of updated) {
					const record = item as { id?: unknown; status?: unknown; error?: unknown } | null;
					if (record && record.status === TEARDOWN_TERMINAL_STATUS) {
						result.cancelled += 1;
					} else {
						result.failed += 1;
						console.warn(`[order-cleanup] order ${record?.id} not finalized:`, record?.error);
					}
				}
			} catch (error) {
				result.failed += batch.length;
				console.warn('[order-cleanup] batch finalize threw:', error);
			}
		}
		console.log(
			`[order-cleanup] finalized ${result.cancelled} pos-open order(s) -> ${TEARDOWN_TERMINAL_STATUS} ` +
				`(left handled: ${result.leftHandled}, failed: ${result.failed})`
		);
	} catch (error) {
		console.warn('[order-cleanup] finalizeCreatedOrders threw:', error);
	}
	return result;
}

/** Matches the client push write surface: `…/push/orders` (and the legacy `…/orders/push`). */
const PUSH_ORDERS_URL = /\/(?:push\/orders|orders\/push)(?:$|[/?])/;

/**
 * Attach a response listener that records the server order id of every order this
 * page pushes. Returns handles the fixture uses in teardown:
 *  - `createdOrderIds`: the live set of captured ids.
 *  - `settle()`: awaits any in-flight response-body parses so teardown sees them all.
 *
 * Only successful POSTs to the push-orders surface are recorded — bulk pull/list
 * responses are ignored, so pre-existing orders are never captured.
 */
export function captureCreatedOrderIds(page: Page): {
	createdOrderIds: Set<number>;
	settle: () => Promise<void>;
} {
	const createdOrderIds = new Set<number>();
	const pending: Promise<void>[] = [];

	page.on('response', (response) => {
		const request = response.request();
		if (request.method() !== 'POST') return;
		if (!PUSH_ORDERS_URL.test(request.url())) return;
		if (!response.ok()) return;
		const task = response
			.json()
			.then((body) => {
				const id = extractOrderIdFromPushBody(body);
				if (id != null && !RETAINED_FIXTURE_ORDER_IDS.has(id)) createdOrderIds.add(id);
			})
			.catch(() => {
				// best-effort: a body we can't parse just isn't captured.
			});
		pending.push(task);
	});

	return {
		createdOrderIds,
		settle: async () => {
			await Promise.allSettled(pending);
		},
	};
}
