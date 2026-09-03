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

import { isolatedProductTest } from './checkout-probe';
import { getStoreUrl, type StoreAuthorization, storeRequestOptions } from './fixtures';
import { resolveProbeAuthorization, TEARDOWN_CREDENTIAL_TIMEOUT_MS } from './probe-credential';

/** POST target the app uses to persist an order. */
export const PUSH_ORDERS = /\/wp-json\/wcpos\/v2\/push\/orders(\?|$)/;

/**
 * Match the completed order-push POST, under EITHER permalink style.
 * Pretty permalinks put the route in the pathname; plain permalinks carry it
 * as `?rest_route=` — matching only the pretty form makes a spec time out on a
 * plain-permalink store despite a successful save (#1114 review). Same dual
 * form orders.spec.ts always used. The first 401 starts the fetcher's single
 * refresh-and-retry cycle; a second 401 is the terminal retry response.
 */
export function createPushOrdersResponseMatcher(): (response: {
	url: () => string;
	request: () => { method: () => string };
	status: () => number;
}) => boolean {
	let sawUnauthorized = false;
	return (response) => {
		if (response.request().method() !== 'POST') return false;
		const url = new URL(response.url());
		const isPushOrders =
			PUSH_ORDERS.test(response.url()) ||
			url.searchParams.get('rest_route') === '/wcpos/v2/push/orders';
		if (!isPushOrders || response.status() !== 401) return isPushOrders;
		if (sawUnauthorized) return true;
		sawUnauthorized = true;
		return false;
	};
}

/** The checkout modal route, `/cart/<uuid>/checkout`. */
const CHECKOUT_ROUTE = /\/cart\/[^/]+\/checkout$/;

/* -------------------------------------------------------------------------- */
/* Wire shapes                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The order fields these specs assert on.
 *
 * Deliberately a narrow, partial view rather than the full WooCommerce order:
 * every field is optional because this is untrusted JSON off the wire, and the
 * index signature keeps the rest reachable without pretending we have modelled
 * it. What matters is that the asserted fields are NAMED — a plugin-side rename
 * then fails to compile here instead of silently degrading an assertion to
 * `undefined === undefined`.
 */
export interface OrderLineItem {
	product_id?: number | string;
	variation_id?: number | string;
	quantity?: number | string;
	subtotal?: string;
	subtotal_tax?: string;
	total?: string;
	total_tax?: string;
	[key: string]: unknown;
}

export interface OrderTaxLine {
	rate_id?: number | string;
	tax_total?: string;
	[key: string]: unknown;
}

export interface OrderRefund {
	id?: number;
	reason?: string;
	total?: string;
	total_tax?: string;
	[key: string]: unknown;
}

export interface ServerOrder {
	id?: number;
	order_id?: number;
	status?: string;
	total?: string;
	cart_tax?: string;
	customer_note?: string;
	date_paid?: string | null;
	date_paid_gmt?: string | null;
	line_items?: OrderLineItem[];
	tax_lines?: OrderTaxLine[];
	refunds?: OrderRefund[];
	_rxdb_revision?: string;
	[key: string]: unknown;
}

/**
 * The `payload` half of the mutation envelope — what the CLIENT ASSERTS.
 *
 * Since #1507 that is line money and structure only: the order aggregate
 * (`total`, `cart_tax`, `discount_total`, `tax_lines`, …) is `readonly` in the
 * wc/v3 schema, WooCommerce authors it from the lines, and the POS no longer
 * puts it in a push body. `total` and `cart_tax` stay TYPED here — a spec may
 * legitimately look for them — but nothing may make an assertion CONDITIONAL on
 * their presence: `if (sent.total !== undefined)` is now a check that never
 * runs. Compare the server against what the TILL shows instead
 * ({@link readCartMoney}) — the referent ADR 0032 §2 is actually about.
 */
export interface OrderPayload {
	total?: string;
	cart_tax?: string;
	discount_total?: string;
	line_items?: OrderLineItem[];
	fee_lines?: OrderLineItem[];
	shipping_lines?: OrderLineItem[];
	tax_lines?: OrderTaxLine[];
	[key: string]: unknown;
}

/** The mutation envelope the write surface POSTs (see `recordPushAdapter`). */
interface PushEnvelope {
	recordId?: string;
	payload?: OrderPayload;
}

/** The write surface's answer to a create/update. */
interface PushAck {
	document?: ServerOrder;
	currentRevision?: string | null;
}

/** An order this run created, as tracked for cleanup. */
export interface TrackedOrder {
	id: number;
	uuid?: string;
	label?: string;
}

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
	options: { onOrderCreated?: (order: TrackedOrder) => void } = {}
): Promise<{ orderId: number; uuid: string; sent: OrderPayload }> {
	const saved = page.waitForResponse(createPushOrdersResponseMatcher(), {
		timeout: 90_000,
	});
	// If the click below throws, this waiter is left pending and rejects later with
	// nobody listening. An unhandled rejection takes down the whole worker process
	// (#997), turning one checkout failure into a shard-wide failure. The no-op
	// handler makes it inert; the `await` on the normal path still sees the result.
	saved.catch(() => {});

	await page.getByTestId('checkout-button').click();

	const response = await saved;
	// The write surface sends the full mutation envelope, so the request itself
	// names the record: `recordId` is the order uuid and `payload` is exactly what
	// the client believes the order to be.
	const envelope = (response.request().postDataJSON() ?? {}) as PushEnvelope;
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

	const ack = (await response.json().catch(() => null)) as PushAck | null;
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

	if (orderId > 0) return { orderId, uuid, sent };

	// The ack carried no id. The order still exists server-side, so recover the id
	// from the payment frame — and register THAT, or a real paid order silently
	// escapes the cleanup registry.
	const resolvedId = await orderIdFromPaymentFrame(page);
	expect(resolvedId, 'server-assigned order id (ack had none, iframe fallback)').toBeGreaterThan(0);
	options.onOrderCreated?.({ id: resolvedId, uuid });
	return { orderId: resolvedId, uuid, sent };
}

/**
 * Fallback order-id source: the payment webview points at WooCommerce's
 * `order-pay/<id>` endpoint, so the id is recoverable even if the push ack was
 * a retry we did not observe.
 */
export async function orderIdFromPaymentFrame(page: Page): Promise<number> {
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
 * #1031 has since gated the button on frame load in the app too, which fixes the
 * cashier-facing half of this. The wait stays, and stays first: it asserts the
 * precise precondition (the store's LISTENER exists), where the app's gate keys
 * off the iframe `onLoad` event — a related but not identical signal. Belt and
 * braces is correct here; a dropped payment message is a silent lost sale.
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
	// Order matters. Since #1031 the app itself keeps this button disabled while
	// `paymentFrameLoading` is true, so `toBeEnabled` now transitively waits on the
	// store's page load — a live cross-origin fetch. Wait for the frame FIRST, so
	// the enabled check is the fast assertion it reads as, and so a slow store
	// fails as "the store payment page never loaded" rather than as an
	// indistinguishable "button never enabled".
	await expect(
		page.frameLocator('iframe[src*="order-pay"]').locator('#place_order'),
		'the store payment page must be loaded before the process-payment message is posted'
	).toBeAttached({ timeout: 90_000 });

	const button = page.getByTestId('process-payment-button');
	await expect(
		button,
		'payment button must be enabled — the store supplied a payment link and the frame has loaded'
	).toBeEnabled({ timeout: 60_000 });

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
): Promise<ServerOrder> {
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
export function unwrapOrders(body: unknown): ServerOrder[] {
	if (Array.isArray(body)) return body as ServerOrder[];
	const record = body as Record<string, unknown> | null;
	const documents = record?.documents;
	if (Array.isArray(documents)) {
		return documents.map(
			(doc) => ((doc as { payload?: ServerOrder })?.payload ?? doc) as ServerOrder
		);
	}
	if (Array.isArray(record?.data)) return record.data as ServerOrder[];
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

/**
 * Parity for SERVER-COMPUTED tax amounts (cart_tax, line total_tax/subtotal_tax).
 *
 * These are the one place client/server equality is legitimately not bit-exact:
 * both engines compute the same rate on the same base, but at the 6dp storage
 * precision a half-way tie can land on either side of the boundary — PHP's
 * IEEE-754 float path and the client's decimal path disagree by at most ONE
 * microunit (observed in CI 2026-08-08: client cart_tax 4.575164 vs server
 * 4.575163 — a .5 tie at the 6th decimal; rate set and 2dp money identical).
 *
 * This is the doctrine's named, quantified exception, not a reopened blanket
 * tolerance: display money (2dp) must be EXACT, and the full-precision values
 * may differ by at most 0.000001. Two microunits is a real drift and fails.
 * Follow-up to eliminate the tie entirely is tracked in the tax-parity program.
 */
export function expectTaxParity(server: unknown, client: unknown, label: string): void {
	const serverValue = String(server ?? '');
	const clientValue = String(client ?? '');
	expect(serverValue, `${label}: server returned no value`).not.toBe('');
	// Number('') is 0, so a missing client value against a server "0" would pass
	// as parity. The caller guards on the client having SENT the field; by the
	// time we are here, an empty client value is a broken payload, not parity.
	expect(clientValue, `${label}: client sent no value`).not.toBe('');

	expect(Number(serverValue).toFixed(2), `${label} (display money, 2dp, exact)`).toBe(
		Number(clientValue).toFixed(2)
	);
	const microunits = Math.abs(Number(serverValue) - Number(clientValue)) * 1_000_000;
	expect(
		microunits,
		`${label}: |server ${serverValue} − client ${clientValue}| must be ≤ 1 microunit (rounding-tie tolerance)`
	).toBeLessThanOrEqual(1.000001);
}

/**
 * Rate-SET parity between the client's and the server's tax_lines.
 *
 * Unconditional over BOTH sides (a missing array reads as the empty set): a
 * tax-free store legitimately compares [] === [], while a serialization
 * regression that DROPS the client's tax_lines on a taxed sale now fails as a
 * set mismatch instead of silently skipping the one assertion that catches
 * tax-location bugs (#1114 review). Every rate_id must be a real id — NaN on
 * either side is a failure, never a wildcard that collapses into set equality.
 */
export function expectRateSetParity(
	sent: readonly string[],
	server: OrderTaxLine[] | undefined,
	label: string
): void {
	const serverRates = (server ?? []).map((line) => {
		// Number('') and Number('  ') coerce to 0 — finite — so a BLANK rate_id
		// would slip a bare isFinite guard as rate "0" and could collide with a
		// genuine rate on the other side (#1116 review, wcpos-bot escalation).
		// Require non-blank BEFORE numeric conversion.
		const raw = String(line.rate_id ?? '').trim();
		expect(
			raw !== '' && Number.isFinite(Number(raw)),
			`${label}: server tax line carries an invalid rate_id (${JSON.stringify(line.rate_id)})`
		).toBe(true);
		return String(Number(raw));
	});
	expect([...new Set(serverRates)].sort(), label).toEqual([...new Set(sent)].sort());
}

/**
 * The tax rates the POS APPLIED, read from the push payload.
 *
 * Not from `tax_lines`: since #1507 the order's tax lines are part of the
 * readonly aggregate and never leave the client, so reading them off the wire
 * yields an empty set and turns a rate-set comparison into `[] vs [rates]` —
 * either a hard failure or, if guarded, a check that silently stops running.
 *
 * The rate set is still fully observable one level down. Every line the POS
 * authors carries its own `taxes[]` keyed by rate id, and those lines ARE what
 * the POS asserts — so this reads the client's applied rates from the same
 * place the divergence comparator does.
 */
export function posAppliedRateIds(payload: OrderPayload, label = 'applied rates'): string[] {
	const rates = new Set<string>();
	for (const array of [payload.line_items, payload.fee_lines, payload.shipping_lines]) {
		for (const line of array ?? []) {
			const taxes = line.taxes;
			if (!Array.isArray(taxes)) continue;
			for (const tax of taxes as { id?: unknown }[]) {
				const raw = String(tax?.id ?? '').trim();
				expect(
					raw !== '' && Number.isFinite(Number(raw)),
					`${label}: client line tax carries an invalid rate id (${JSON.stringify(tax?.id)})`
				).toBe(true);
				rates.add(String(Number(raw)));
			}
		}
	}
	return [...rates].sort();
}

/** The till's own money, read from the cart's raw value-bearing markers. */
export interface CartMoney {
	/** The persisted order total the cart is showing, e.g. `36.68`. */
	total: string;
	/** The persisted discount total, e.g. `3.33`. `''` before any settlement. */
	discountTotal: string;
}

/**
 * Read what the CASHIER is looking at, once the cart has settled it.
 *
 * This is the client-side referent for every aggregate assertion since #1507.
 * The push body no longer carries the aggregate, and the cart's visible totals
 * are translated, currency-formatted composites — so the value-bearing hidden
 * markers in `pos/cart/totals.tsx` are what a spec addresses, exactly as the
 * data-table footer's row counts are read rather than its "Showing n of m".
 *
 * The wait on `cart-order-total` is not politeness: settlement is asynchronous,
 * so reading straight after an add would race it and hand back `''`. Waiting
 * HERE rather than in each caller means no spec can quietly compare against an
 * unsettled cart.
 *
 * `cart-discount-total` is NOT waited on by default, because `''` is the right
 * answer for an uncouponed sale. A couponed spec must pass `discounted: true`:
 * adding a product already gives the TOTAL a digit, so without it the default
 * wait is satisfied the moment the cart has any money at all, and the read
 * races the coupon's own settlement pass — `useAddCoupon` patches the line
 * arrays, and `discount_total` is written asynchronously after that.
 *
 * ONE ORDERING RULE, and it is load-bearing: call this BEFORE the push whose
 * ack you are going to compare against. The POS adopts the server's money
 * (ADR 0032), so a read taken after the ack has landed can BE the server's own
 * figure — an assertion that passes whatever the server did.
 */
export async function readCartMoney(
	page: Page,
	options: { discounted?: boolean } = {}
): Promise<CartMoney> {
	const marker = (testId: string) => page.getByTestId(testId);
	const total = marker('cart-order-total');
	// Exactly one: OpenOrders — and so the cart, and so these markers — is
	// mounted once, by design (see useCartSettlement's "mounted exactly once"
	// note). Two would mean two carts, which is a defect in its own right and
	// would make "the" cart total ambiguous.
	await expect(total, 'exactly one cart-order-total must be rendered').toHaveCount(1);
	await expect(total, 'the cart must settle a total before it can be compared').toHaveText(/\d/, {
		timeout: 30_000,
	});
	if (options.discounted) {
		// A NON-ZERO digit, so `0.00` does not satisfy it — the referent is "the
		// cart has applied the discount", not "the marker has rendered".
		await expect(
			marker('cart-discount-total'),
			'the cart must settle the coupon discount before it can be compared'
		).toHaveText(/[1-9]/, { timeout: 30_000 });
	}
	const read = async (testId: string): Promise<string> =>
		((await marker(testId).textContent()) ?? '').trim();
	return {
		total: await read('cart-order-total'),
		discountTotal: await read('cart-discount-total'),
	};
}

/** Terminal states that mean the sale did NOT happen. */
const UNPAID_STATUSES = new Set(['pos-open', 'failed', 'cancelled', 'trash', 'pending']);

/**
 * Assert that a server order was genuinely PAID.
 *
 * "Not `pos-open`" is not enough: `failed` and `cancelled` also satisfy it, and
 * WooCommerce will happily record a refund against an order that never took
 * payment — so a refund test asserting only "not pos-open" can pass without ever
 * covering the payment half of its own name.
 *
 * `date_paid` is the store-config-independent signal: WooCommerce stamps it in
 * `payment_complete()`, whatever status the POS is configured to map sales to.
 */
export function expectOrderPaid(order: ServerOrder): void {
	const status = String(order.status ?? '').replace(/^wc-/, '');
	expect(UNPAID_STATUSES.has(status), `order ended in an unpaid state: "${status}"`).toBe(false);
	expect(
		order.date_paid ?? order.date_paid_gmt,
		'WooCommerce must have recorded the payment (date_paid)'
	).toBeTruthy();
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
	order: TrackedOrder
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

	// Ownership read goes through `readOrder`, which retries transient 5xx. A
	// single bare read here would turn one 502 into either a guaranteed leak (the
	// update serialises without `baseRevision` and the push contract rejects it) or
	// an unverified write.
	const current = await readOrder(request, testInfo, authorization, order.id).catch(() => null);

	// Ownership must be PROVEN, not merely "not disproven". If the read failed
	// after its retries, we do not know whose order this is, and on a shared live
	// store the worse outcome is modifying someone else's record — a leak is
	// recoverable from the id printed above, a wrong write is not.
	if (order.label && current?.customer_note !== order.label) {
		console.warn(
			`[e2e-cleanup] SKIPPING order ${order.id}: ownership not verified ` +
				`(${current ? "note does not match this run's label" : 'readback failed'}). ` +
				`Refusing to modify an order this test may not have created. ` +
				`Prune by hand using the id above.`
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
				// A 2xx is not proof, and neither is silence. Only a status the SERVER
				// reported counts — defaulting to the status we asked for would report
				// success on a malformed or changed response and hide a live order.
				const parsed = JSON.parse(body || '{}') as PushAck;
				const kept = parsed?.document?.status;
				if (typeof kept === 'string') {
					if (!CLEANED_UP.has(kept.replace(/^wc-/, ''))) {
						attempts.push(`${status}: server kept status "${kept}"`);
						return false;
					}
					return true;
				}
				// No status in the ack: go and look, rather than assume.
				const after = await readOrder(request, testInfo, authorization, order.id).catch(() => null);
				const observed = String(after?.status ?? '').replace(/^wc-/, '');
				if (!after || !CLEANED_UP.has(observed)) {
					attempts.push(
						`${status}: ack omitted document.status and readback showed ` +
							`"${after ? observed : 'unreadable'}"`
					);
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
export const liveOrderTest = isolatedProductTest.extend<{
	trackOrder: (order: TrackedOrder) => void;
}>({
	trackOrder: async ({ request, storeAuthorization }, use, testInfo) => {
		const tracked = new Map<number, TrackedOrder>();

		// eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright fixture API, not a React hook
		await use((order) => {
			tracked.set(order.id, { ...tracked.get(order.id), ...order });
		});

		if (tracked.size === 0) return;

		// Resolve the credential ONCE, against the namespace trashOrder uses. The captured
		// value is the last credential the app was seen SENDING: on a restored session that
		// is routinely an expired token, and replaying it makes the ownership read fail —
		// which trashOrder correctly treats as "ownership not proven" and skips, leaking
		// every order this test created. Falling back to the captured value on a failed
		// resolve keeps the previous behaviour rather than dropping cleanup entirely.
		const authorization = await resolveProbeAuthorization(
			request,
			getStoreUrl(testInfo),
			storeAuthorization,
			{ route: '/wcpos/v2/orders', timeoutMs: TEARDOWN_CREDENTIAL_TIMEOUT_MS }
		).catch((error) => {
			console.warn(
				'[e2e-cleanup] no live store credential for teardown; trying the captured one:',
				error instanceof Error ? error.message : String(error)
			);
			return storeAuthorization();
		});

		for (const order of tracked.values()) {
			await trashOrder(request, testInfo, authorization, order).catch((error) => {
				console.warn(`[e2e-cleanup] teardown failed for order ${order.id}:`, error);
			});
		}
	},
});
