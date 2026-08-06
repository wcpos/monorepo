/**
 * Real-order E2E lifecycle helpers — wcpos/monorepo#1012 + the R14 ruling.
 *
 * These specs run against the STANDING LIVE STORE (dev-next.wcpos.com), shared
 * with every other shard and with humans. There is no ephemeral store, so the
 * contract every write-heavy spec here follows is:
 *
 *   1. LABEL every order it creates with a globally unique run label
 *      (`customer_note`), so its records are identifiable in a shared store.
 *   2. ASSERT ONLY against records it created — never "the newest order",
 *      never a count of all orders. The order id comes from the push ack for
 *      the very order under test, and the label is re-checked on readback.
 *   3. CLEAN UP its own orders in teardown, best-effort, and always print the
 *      created ids so anything that leaks can be pruned by hand.
 *
 * The demo cashier cannot hard-DELETE orders, so cleanup is a status change to
 * `trash` (falling back to `cancelled`) — cancel/trash + label is the accepted
 * cleanup per the ruling, not a promise that the row disappears.
 */

import { randomUUID } from 'crypto';

import { type APIRequestContext, expect, type Page, type TestInfo } from '@playwright/test';

import {
	authenticatedTest,
	getStoreUrl,
	type StoreAuthorization,
	storeRequestOptions,
} from './fixtures';

/** POST target the app uses to persist an order. */
const PUSH_ORDERS = /\/wp-json\/wcpos\/v2\/push\/orders(\?|$)/;

/** The checkout modal route, `/cart/<uuid>/checkout`. */
const CHECKOUT_ROUTE = /\/cart\/[^/]+\/checkout$/;

/**
 * A human-traceable scope for this process: which CI run (and attempt) created
 * the order. Shards each run in their own process, so this is NOT unique on its
 * own — {@link newRunLabel} adds a per-order UUID, which is what actually makes
 * collisions impossible across shards, workers and retries.
 */
const RUN_SCOPE = [
	process.env.GITHUB_RUN_ID ?? 'local',
	process.env.GITHUB_RUN_ATTEMPT ?? '0',
	process.env.GITHUB_JOB ?? process.env.USER ?? 'dev',
].join('-');

/**
 * A unique label for ONE order. Call it per order, never per file: two shards
 * running the same spec must never mint the same label.
 */
export function newRunLabel(): string {
	return `wcpos-e2e ${RUN_SCOPE} ${randomUUID()}`;
}

/**
 * Stamp the run label onto the order via the cart's order-note UI, so the
 * created order is identifiable in the shared store.
 */
export async function stampRunLabel(page: Page, label: string): Promise<void> {
	await page.getByTestId('order-note-button').click();
	const input = page.getByTestId('order-note-input');
	await expect(input).toBeVisible({ timeout: 15_000 });
	await input.fill(label);
	await page.getByTestId('add-note-button').click();
	await expect(page.getByTestId('order-note-dialog')).toBeHidden({ timeout: 15_000 });
}

/**
 * Click Checkout and wait, deterministically, for the checkout modal.
 *
 * WHY THIS EXISTS (#1012). `PayButton.handlePay` awaits `pushDocument(order)` —
 * a live POST to `/wcpos/v2/push/orders` — and only calls `router.push(...)`
 * *after* it resolves. The old specs clicked Checkout and then waited 10s for
 * `process-payment-button`. That single budget had to cover an unbounded
 * round-trip to dev-next, the local engine write, the route transition AND the
 * modal's own Suspense resolution. When the store was slow the app was still
 * sitting on the cart with the Pay button spinning, so the testID was genuinely
 * absent and Playwright reported `element(s) not found` — which reads like a
 * markup bug but is really "the server had not answered yet".
 *
 * So: wait on the ACTUAL causes in order — the save response, then the route,
 * then the modal — instead of on a symptom with a guessed timeout. Each step
 * gets its own budget and its own error message, so a genuinely missing button
 * still fails, and fails legibly.
 */
export async function openCheckout(
	page: Page,
	options: { onOrderCreated?: (order: { id: number; uuid: string }) => void } = {}
): Promise<{ orderId: number; uuid: string; sent: any }> {
	const saved = page.waitForResponse(
		(response) => PUSH_ORDERS.test(response.url()) && response.request().method() === 'POST',
		{ timeout: 90_000 }
	);

	await page.getByTestId('checkout-button').click();

	const response = await saved;
	// The write surface sends the full mutation envelope, so the request itself
	// names the record: `recordId` is the order uuid and `payload` is exactly what
	// the client believes the order to be.
	const envelope = (response.request().postDataJSON() ?? {}) as {
		recordId?: string;
		payload?: any;
	};
	const uuid = envelope.recordId ?? '';
	const sent = envelope.payload ?? {};

	// Fail on the save, at the save. `handlePay` only routes when the push
	// resolves, so a rejected save can never produce a checkout modal — waiting
	// another 60s for a route that provably will not arrive just buries the cause.
	if (response.status() >= 400) {
		throw new Error(
			`Order save failed: POST push/orders -> HTTP ${response.status()}. ` +
				`The app stays on the cart when the save fails, so no checkout modal will open.`
		);
	}

	const ack = await response.json().catch(() => null as any);
	const orderId = Number(ack?.document?.id ?? 0);

	// REGISTER FOR CLEANUP HERE, not at the end. The order exists on the server
	// from this moment on; every wait below can still fail, and an order that
	// leaks because its test died two lines later is exactly the litter this
	// contract exists to prevent.
	if (orderId > 0) options.onOrderCreated?.({ id: orderId, uuid });

	await page.waitForURL(CHECKOUT_ROUTE, { timeout: 60_000 }).catch(() => {
		throw new Error(
			`Checkout route never opened after the order saved ` +
				`(push/orders -> HTTP ${response.status()}, url: ${page.url()}).`
		);
	});

	// Correlate: the save we observed must be the order we are now checking out.
	// Any other match would make the readback assert against the wrong record.
	const routeUuid = /\/cart\/([^/]+)\/checkout$/.exec(new URL(page.url()).pathname)?.[1];
	expect(routeUuid, 'the observed order save must belong to the order under checkout').toBe(uuid);

	// The modal body is Suspense-gated on the order document resolving out of the
	// local engine, so the dialog can mount after the route settles.
	await expect(page.getByTestId('checkout-dialog')).toBeVisible({ timeout: 30_000 });
	await expect(page.getByTestId('process-payment-button')).toBeVisible({ timeout: 30_000 });

	const resolvedId = orderId > 0 ? orderId : await orderIdFromPaymentFrame(page);
	return { orderId: resolvedId, uuid, sent };
}

/**
 * Fallback order-id source: the payment webview points at WooCommerce's
 * `order-pay/<id>` endpoint, so the id is recoverable even if the push ack was
 * a retry we did not observe.
 */
async function orderIdFromPaymentFrame(page: Page): Promise<number> {
	const src = await page
		.locator('iframe')
		.first()
		.getAttribute('src', { timeout: 15_000 })
		.catch(() => null);
	const id = src ? /order-pay\/(\d+)/.exec(src)?.[1] : undefined;
	return id ? Number(id) : 0;
}

/**
 * Process the payment and wait for the app to leave the checkout route.
 *
 * The legacy webview posts `wcpos-process-payment` into the store's order-pay
 * iframe; the store's inline handler clicks its hidden `#place_order`, the
 * order is paid, the frame navigates to the receipt page and posts
 * `wcpos-payment-received` back. Only then does the app `router.replace` to the
 * receipt (when auto-show-receipt is on) or back to the cart. Leaving
 * `/checkout` is therefore the app's own completion signal.
 *
 * WAITING FOR THE FRAME IS LOAD-BEARING, not politeness. `wcpos-process-payment`
 * is a fire-and-forget `postMessage` with no ack and no retry: if it is posted
 * before the store page has parsed and registered its listener, it is dropped
 * silently and the button spins forever. Measured against dev-next, clicking as
 * soon as the button is enabled loses the message ~100% of the time; waiting for
 * the frame first completes payment in ~5s. The store's handler is an inline
 * <head> script, so the presence of `#place_order` in the body proves the
 * listener is already registered.
 *
 * (`#place_order` is a WooCommerce selector inside the STORE's own checkout
 * page, not app UI — the repo's testID policy governs app markup, which this
 * third-party document is not.)
 *
 * Deliberately NOT asserted here: "receipt OR the POS screen is visible". The
 * POS screen sits behind the modal the whole time, so that assertion can pass
 * before any payment happens. Route departure cannot.
 */
export async function processPayment(page: Page): Promise<void> {
	const button = page.getByTestId('process-payment-button');
	await expect(
		button,
		'payment button must be enabled — the store supplied a payment link'
	).toBeEnabled({ timeout: 30_000 });

	await expect(
		page.frameLocator('iframe[src*="order-pay"]').locator('#place_order'),
		'the store payment page must be loaded before the process-payment message is posted'
	).toBeAttached({ timeout: 60_000 });

	await button.click();

	await page.waitForURL((url) => !CHECKOUT_ROUTE.test(url.pathname), { timeout: 120_000 });
	await expect(page.getByTestId('checkout-dialog')).toBeHidden({ timeout: 30_000 });
}

/* -------------------------------------------------------------------------- */
/* Server-side readback                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Read an order back from the store's REST API, out of band.
 *
 * Uses Playwright's `APIRequestContext`, which is NOT affected by page route
 * stubs — so this is genuine server truth, not something the test faked.
 *
 * `dp=6` asks WooCommerce for full stored precision. NOTE: the app itself must
 * never send `dp` on its sync reads; this is a test-only probe.
 */
export async function readOrder(
	request: APIRequestContext,
	testInfo: TestInfo,
	authorization: StoreAuthorization | null,
	orderId: number
): Promise<Record<string, any>> {
	const storeUrl = getStoreUrl(testInfo).replace(/\/+$/, '');
	const { headers, params } = storeRequestOptions(authorization);

	// dev-next is a real WordPress host and answers the occasional 502/504 under
	// load from six parallel shards. A transient gateway error is not a verdict
	// about the order, so retry briefly rather than fail the assertion it feeds.
	let last = '';
	for (let attempt = 1; attempt <= 4; attempt++) {
		const response = await request
			.get(`${storeUrl}/wp-json/wcpos/v2/orders`, {
				headers,
				params: { ...params, include: String(orderId), per_page: '1', dp: '6' },
				failOnStatusCode: false,
			})
			.catch((error) => {
				last = error instanceof Error ? error.message : String(error);
				return null;
			});

		if (response) {
			if (response.status() < 400) {
				const order = unwrapOrders(await response.json())[0];
				expect(order, `order ${orderId} must exist on the server`).toBeTruthy();
				return order;
			}
			last = `HTTP ${response.status()}`;
			// 4xx is a real answer (bad auth, bad id) — retrying cannot change it.
			if (response.status() < 500) break;
		}
		if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
	}

	throw new Error(`readback of order ${orderId} failed: ${last}`);
}

/**
 * The wcpos sync routes have carried more than one envelope over time (a bare
 * array, `{documents: [{payload}]}`, and axios-style `{data}`). Normalise
 * rather than pin, so a plugin-side envelope change fails the assertion that
 * actually matters instead of exploding in the unwrapping.
 */
export function unwrapOrders(body: unknown): Record<string, any>[] {
	if (Array.isArray(body)) return body as Record<string, any>[];
	const record = body as Record<string, any> | null;
	if (Array.isArray(record?.documents)) {
		return record!.documents.map((doc: any) => doc?.payload ?? doc);
	}
	if (Array.isArray(record?.data)) return record!.data;
	return [];
}

/* -------------------------------------------------------------------------- */
/* Money assertions                                                           */
/* -------------------------------------------------------------------------- */

function decimalsOf(value: string): number {
	return /\.(\d+)$/.exec(value)?.[1].length ?? 0;
}

/**
 * Assert a server monetary field equals the client's value, AT THE PRECISION
 * THE SERVER CHOSE TO RETURN.
 *
 * Why tolerant: the v2 routes currently serialise money at *display* decimals
 * regardless of `dp` — that is wcpos/woocommerce-pos#946, a known server-side
 * gap. Pinning 6dp today would make this spec red on day one for a defect it
 * does not own. Comparing at the server's own precision still catches every
 * real mismatch (a wrong amount, a dropped tax line, a mis-rounded subtotal);
 * it only forgives trailing zeros the server declined to send.
 *
 * The 6dp contract is asserted separately by the `test.fixme` in
 * pos-checkout.spec.ts, which flips to a real assertion when #946 lands.
 */
/** Decimal places the v2 routes are asked for, and expected to honour. */
export const REQUESTED_MONEY_DP = 6;

/**
 * Assert a monetary field came back at the FULL STORED PRECISION we asked for
 * (`dp=6`), not rounded to display decimals.
 *
 * This is the wcpos/woocommerce-pos#946 contract. It is asserted rather than
 * parked behind a `test.fixme` because it was measured live against dev-next on
 * 2026-08-06: the `/wcpos/v2/orders` route honours `dp` today, returning values
 * like `45.000000` and `4.090909`. If a plugin change starts serialising money
 * at display decimals, that is a real regression and this is where it surfaces.
 */
export function expectFullPrecision(value: unknown, label: string): void {
	const text = String(value ?? '');
	expect(text, `${label}: server returned no value`).not.toBe('');
	expect(Number.isFinite(Number(text)), `${label}: "${text}" is not numeric`).toBe(true);
	expect(
		decimalsOf(text),
		`${label}: expected ${REQUESTED_MONEY_DP}dp stored precision, got "${text}" (see #946)`
	).toBe(REQUESTED_MONEY_DP);
}

export function expectMoneyMatches(server: unknown, client: unknown, label: string): void {
	const serverValue = String(server ?? '');
	const clientValue = String(client ?? '');
	expect(serverValue, `${label}: server returned no value`).not.toBe('');

	// NEVER below 2dp. Comparing at the server's own precision is the #946
	// tolerance, but a server that answers `"10"` for a `"10.49"` line item must
	// still fail — currency minor units are the floor, not something the server
	// gets to negotiate away.
	const dp = Math.max(decimalsOf(serverValue), 2);
	expect(Number(serverValue).toFixed(dp), `${label} (compared at ${dp}dp)`).toBe(
		Number(clientValue).toFixed(dp)
	);
}

/* -------------------------------------------------------------------------- */
/* Cleanup                                                                    */
/* -------------------------------------------------------------------------- */

/** Statuses that count as "this order is cleaned up". */
const CLEANED_UP = new Set(['trash', 'cancelled', 'wc-cancelled']);

/**
 * Best-effort teardown for an order this spec created.
 *
 * ALWAYS records the order id in the test output first, then tries to trash it.
 * Recording happens first on purpose: if the store rejects the status change —
 * or the whole test already failed — the id is still in the report, so a leaked
 * order is traceable rather than anonymous. Cleanup NEVER throws; a failed
 * teardown must not convert a passing test into a red one, nor mask a real
 * failure with a cleanup error.
 *
 * SAFETY: on a live shared store, the only thing worse than leaking an order is
 * trashing somebody else's. So the order is read back first and only touched
 * when its `customer_note` still carries THIS test's label.
 */
export async function trashOrder(
	request: APIRequestContext,
	testInfo: TestInfo,
	authorization: StoreAuthorization | null,
	order: { id: number; uuid?: string; label?: string }
): Promise<void> {
	console.log(`[e2e-cleanup] created order ${order.id} (${order.label ?? 'unlabelled'})`);
	await testInfo
		.attach(`created-order-${order.id}`, {
			body: JSON.stringify({ ...order, storeUrl: getStoreUrl(testInfo) }, null, 2),
			contentType: 'application/json',
		})
		.catch(() => {});

	const storeUrl = getStoreUrl(testInfo).replace(/\/+$/, '');
	const { headers, params } = storeRequestOptions(authorization);

	const current = await request
		.get(`${storeUrl}/wp-json/wcpos/v2/orders`, {
			headers,
			params: { ...params, include: String(order.id), per_page: '1' },
			failOnStatusCode: false,
		})
		.then(async (response) => (response.ok() ? unwrapOrders(await response.json())[0] : null))
		.catch(() => null);

	if (order.label && current && current.customer_note !== order.label) {
		console.warn(
			`[e2e-cleanup] SKIPPING order ${order.id}: its note is not this run's label. ` +
				`Refusing to modify an order this test did not create.`
		);
		return;
	}

	const attempts: string[] = [];
	for (const status of ['trash', 'cancelled']) {
		// The write surface validates this strictly: a bare uuid in the body, and the
		// Idempotency-Key header must mirror it exactly (ADR 0011) or it answers 422.
		const mutationId = randomUUID();
		const applied = await request
			.post(`${storeUrl}/wp-json/wcpos/v2/push/orders`, {
				headers: { ...headers, 'Idempotency-Key': mutationId },
				params,
				data: {
					mutationId,
					operation: 'update',
					collection: 'orders',
					recordId: order.uuid,
					baseRevision: current?._rxdb_revision ?? current?.currentRevision,
					payload: { id: order.id, status },
				},
				failOnStatusCode: false,
			})
			.then(async (response) => {
				const body = await response.text().catch(() => '');
				if (!response.ok()) {
					attempts.push(`${status}: HTTP ${response.status()} ${body.slice(0, 200)}`);
					return false;
				}
				// A 2xx is not proof: confirm the status the server actually kept.
				const parsed = JSON.parse(body || '{}');
				const kept = String(parsed?.document?.status ?? status).replace(/^wc-/, '');
				if (!CLEANED_UP.has(kept)) {
					attempts.push(`${status}: server kept status "${kept}"`);
					return false;
				}
				return true;
			})
			.catch((error) => {
				attempts.push(`${status}: ${error instanceof Error ? error.message : String(error)}`);
				return false;
			});

		if (applied) {
			console.log(`[e2e-cleanup] order ${order.id} -> ${status}`);
			return;
		}
	}

	console.warn(
		`[e2e-cleanup] could not trash order ${order.id}. It is labelled "${order.label}" and ` +
			`listed above for manual pruning. Attempts: ${attempts.join(' | ')}`
	);
}

/**
 * `authenticatedTest` plus an automatic cleanup registry for orders a test
 * creates on the live store.
 *
 * WHY A FIXTURE rather than a `try/finally` in the test: fixture teardown runs
 * on its own budget after the test body, so it still executes when the test
 * TIMES OUT — the exact case where a half-finished payment is most likely to
 * have left an order behind. A `finally` inside the test body does not survive
 * a hard timeout.
 */
export const liveOrderTest = authenticatedTest.extend<{
	trackOrder: (order: { id: number; uuid?: string; label?: string }) => void;
}>({
	trackOrder: async ({ request, storeAuthorization }, use, testInfo) => {
		const tracked = new Map<number, { id: number; uuid?: string; label?: string }>();

		// eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright fixture API, not a React hook
		await use((order) => {
			tracked.set(order.id, { ...tracked.get(order.id), ...order });
		});

		for (const order of tracked.values()) {
			await trashOrder(request, testInfo, storeAuthorization(), order).catch((error) => {
				console.warn(`[e2e-cleanup] teardown failed for order ${order.id}:`, error);
			});
		}
	},
});
