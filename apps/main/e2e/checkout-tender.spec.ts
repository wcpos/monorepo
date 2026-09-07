/**
 * Live smoke for the in-place checkout columns (wcpos/roadmap#165; contract routes #1839).
 *
 * WHAT THIS COVERS that the unit suites cannot: the tender flow only renders when the
 * STORE serves `GET wcpos/v2/payment-methods`; at lg it replaces the products column
 * in place, and every leg it records is a real `POST orders/{id}/payments` whose
 * result the app reads back out of the order's `_wcpos_payments` ledger. Tiles, keypad,
 * split and cancel are therefore only genuinely exercised against a live store.
 *
 * Store-agnostic per CLAUDE.md: every order is created through the POS UI from this run's
 * own probe product, the method ids come from the store's own descriptor (never hardcoded),
 * and a store that does not serve the payments contract SKIPS with a reason rather than
 * failing — a store that serves it and then misbehaves fails.
 */
import { type APIRequestContext, expect, type Page, type TestInfo } from '@playwright/test';

import { log } from '@wcpos/utils/logger';

import { addCheckoutProbeProductAgain, tryAddRunPrivateSimpleProduct } from './checkout-probe';
import { getStoreUrl, getStoreVariant, wcposRestRoute } from './fixtures';
import {
	createPushOrdersResponseMatcher,
	expectOrderPaid,
	liveOrderTest as liveTest,
	newRunLabel,
	orderIdFromPaymentFrame,
	readCartMoney,
	readOrder,
	type ServerOrder,
	stampRunLabel,
	type TrackedOrder,
} from './order-lifecycle';
import {
	resolveProbeAuthorization,
	type StoreAuthorization,
	storeRequestOptions,
} from './probe-credential';

/** Digits only, so an amount reads the same in any currency or locale format. */
function digitsOf(value: string): string {
	return value.replace(/\D/g, '');
}

/**
 * An amount rendered by a value-bearing testID, as MINOR UNITS.
 *
 * Every figure in these checkout columns is held in minor units and formatted through one place
 * (`useCurrencyFormat`), so the rendered digits ARE the minor-unit number — which is
 * also exactly what the keypad keys shift in. That makes it safe to compare a display
 * against a keypad entry without knowing the store's currency or decimal places.
 */
async function readAmountMinor(page: Page, testId: string): Promise<number> {
	const text = (await page.getByTestId(testId).textContent()) ?? '';
	const digits = digitsOf(text);
	expect(digits, `${testId} must render an amount, got "${text}"`).not.toBe('');
	return Number(digits);
}

/* -------------------------------------------------------------------------- */
/* The store's payment-method descriptor                                      */
/* -------------------------------------------------------------------------- */

interface Descriptor {
	id: string;
	title?: string;
	kind?: string;
	pos_enabled?: boolean;
	capture?: { mode?: string };
}

/**
 * The store's own method list, or `null` when the store does not serve the payments
 * contract at all (404 — the same answer the app treats as "keep the legacy checkout").
 * Any OTHER failure is a broken environment and throws.
 */
async function fetchDescriptors(
	request: APIRequestContext,
	testInfo: TestInfo,
	authorization: StoreAuthorization
): Promise<Descriptor[] | null> {
	const base = getStoreUrl(testInfo).replace(/\/+$/, '');
	const route = '/wcpos/v2/payment-methods';
	const { headers, params } = storeRequestOptions(authorization);

	// Pretty permalinks first, then the plain `?rest_route=` spelling (store-agnostic policy).
	let response = await request.get(`${base}/wp-json${route}`, {
		headers,
		params,
		failOnStatusCode: false,
	});
	if (response.status() === 404) {
		response = await request.get(`${base}/index.php`, {
			headers,
			params: { ...params, rest_route: route },
			failOnStatusCode: false,
		});
	}
	if (response.status() === 404) return null;
	expect(response.status(), `${route} must answer or 404, not error`).toBeLessThan(400);

	const body = (await response.json()) as { schema?: number; methods?: Descriptor[] };
	expect(body?.schema, `${route} must serve payments contract schema 1`).toBe(1);
	expect(Array.isArray(body?.methods), `${route} must carry a methods array`).toBe(true);
	return body.methods ?? [];
}

/** Methods the tender grid can actually drive: enabled, and captured by the app itself. */
function manualMethods(descriptors: Descriptor[]): Descriptor[] {
	return descriptors.filter((method) => method.pos_enabled && method.capture?.mode === 'manual');
}

/** Require the live store to expose the payments contract and tender checkout UI. */
async function requireTenderCheckout(
	request: APIRequestContext,
	testInfo: TestInfo,
	storeAuthorization: () => StoreAuthorization | null,
	mode: 'tender' | 'legacy'
): Promise<{ authorization: StoreAuthorization; descriptors: Descriptor[] }> {
	const authorization = await resolveProbeAuthorization(
		request,
		getStoreUrl(testInfo),
		storeAuthorization,
		{ route: '/wcpos/v2/orders' }
	);
	const descriptors = await fetchDescriptors(request, testInfo, authorization);
	liveTest.skip(descriptors === null, 'store does not serve the payments contract');
	expect(mode, 'a store serving the payments contract must render the tender checkout').toBe(
		'tender'
	);
	return { authorization, descriptors: descriptors! };
}

type PaymentWrite = 'record' | 'void';

function createPaymentResponseMatcher(orderId: number, write: PaymentWrite) {
	let sawUnauthorized = false;
	return (response: {
		url: () => string;
		request: () => { method: () => string };
		status: () => number;
	}) => {
		if (response.request().method() !== 'POST') return false;
		const route = wcposRestRoute(response.url());
		const base = `/wcpos/v2/orders/${orderId}/payments`;
		const matches =
			write === 'record' ? route === base : new RegExp(`^${base}/[^/]+/void$`).test(route ?? '');
		if (!matches || response.status() !== 401) return matches;
		if (sawUnauthorized) return true;
		sawUnauthorized = true;
		return false;
	};
}

async function clickAndExpectPaymentWrite(
	page: Page,
	testId: string,
	orderId: number,
	write: PaymentWrite
): Promise<void> {
	const pending = page.waitForResponse(createPaymentResponseMatcher(orderId, write), {
		timeout: 90_000,
	});
	pending.catch(() => {});
	await page.getByTestId(testId).click();
	const response = await pending;
	expect(response.status(), `${write} payment POST must succeed`).toBeLessThan(400);
}

/* -------------------------------------------------------------------------- */
/* The order's payment ledger, read back from the server                      */
/* -------------------------------------------------------------------------- */

interface LedgerRow {
	id?: string;
	method_id?: string;
	kind?: string;
	amount?: string;
	status?: string;
}

/**
 * The ledger the SERVER holds for an order.
 *
 * Read shape-tolerantly on purpose: the rows live in `_wcpos_payments` typed meta, and the
 * v2 order resource may surface the same ledger as a wire field (#1839 `Ledger::to_wire`).
 * Normalising here means a change of envelope fails the assertion about the PAYMENTS
 * instead of exploding in the unwrapping — the same reasoning as `unwrapOrders`.
 */
function ledgerRows(order: ServerOrder): LedgerRow[] {
	const parse = (value: unknown): unknown => {
		if (typeof value !== 'string') return value;
		try {
			return JSON.parse(value) as unknown;
		} catch {
			return null;
		}
	};
	const meta = (order.meta_data as { key?: string; value?: unknown }[] | undefined)?.find(
		({ key }) => key === '_wcpos_payments'
	)?.value;
	for (const candidate of [meta, order._wcpos_payments, order.payments, order.ledger]) {
		const parsed = parse(candidate);
		if (Array.isArray(parsed)) return parsed as LedgerRow[];
		const payments = (parsed as { payments?: unknown } | null)?.payments;
		if (Array.isArray(payments)) return payments as LedgerRow[];
	}
	return [];
}

/**
 * Poll the server until the order satisfies `check`, then hand it back.
 *
 * Polling rather than one read: the app records a leg and changes checkout stage in the same tick,
 * so a single read races the store's own write. The final order is returned so the caller
 * asserts against the exact document that satisfied the predicate.
 */
async function pollOrder(
	request: APIRequestContext,
	testInfo: TestInfo,
	authorization: StoreAuthorization,
	orderId: number,
	check: (order: ServerOrder) => boolean,
	message: string
): Promise<ServerOrder> {
	const seen: { order: ServerOrder | null } = { order: null };
	await expect
		.poll(
			async () => {
				seen.order = await readOrder(request, testInfo, authorization, orderId);
				return check(seen.order);
			},
			{ timeout: 90_000, intervals: [1_000, 2_000, 3_000, 5_000], message }
		)
		.toBe(true);
	return seen.order!;
}

/* -------------------------------------------------------------------------- */
/* Opening the checkout                                                       */
/* -------------------------------------------------------------------------- */

/**
 * `openCheckout` (order-lifecycle.ts) waits on `process-payment-button`, which exists only
 * in the LEGACY checkout — it can never see the tender flow. This is the same wait-on-the-
 * cause sequence (save → checkout container) ending on whichever checkout the store served.
 */
async function openCheckout(
	page: Page,
	onOrderCreated: (order: TrackedOrder) => void
): Promise<{ orderId: number; uuid: string; mode: 'tender' | 'legacy' }> {
	const saved = page.waitForResponse(createPushOrdersResponseMatcher(), { timeout: 90_000 });
	// An unhandled rejection here takes down the whole worker process (#997).
	saved.catch(() => {});

	await page.getByTestId('checkout-button').click();

	const response = await saved;
	const uuid = (response.request().postDataJSON()?.recordId ?? '') as string;
	if (response.status() >= 400) {
		throw new Error(
			`Order save failed: POST push/orders -> HTTP ${response.status()}. ` +
				`The app stays on the cart when the save fails, so no checkout will open.`
		);
	}
	const ack = (await response.json().catch(() => null)) as { document?: { id?: number } } | null;
	let orderId = Number(ack?.document?.id ?? 0);
	// Register before any wait that can fail: the order exists on the server from here on.
	if (orderId > 0) onOrderCreated({ id: orderId, uuid });

	// Tender checkout swaps into the products column; legacy stores still open a modal.
	// Neither container appearing is a failure, not a missing-contract skip.
	const tender = page.getByTestId('checkout-tender-pane');
	const legacy = page.getByTestId('checkout-dialog');
	await expect(tender.or(legacy).filter({ visible: true }).first()).toBeVisible({
		timeout: 60_000,
	});
	const mode = (await tender.isVisible()) ? 'tender' : 'legacy';

	if (orderId <= 0) {
		if (mode === 'tender') {
			await expect
				.poll(
					async () =>
						Number((await page.getByTestId('checkout-server-order-id').textContent()) ?? 0),
					{
						timeout: 30_000,
						message: 'the tender checkout must expose its server-assigned order id',
					}
				)
				.toBeGreaterThan(0);
			orderId = Number((await page.getByTestId('checkout-server-order-id').textContent()) ?? 0);
		} else {
			orderId = await orderIdFromPaymentFrame(page);
		}
		expect(orderId, 'server-assigned order id (push ack had none)').toBeGreaterThan(0);
		onOrderCreated({ id: orderId, uuid });
	}
	return { orderId, uuid, mode };
}

/** Add this run's probe product, label the order, and open checkout on it. */
async function newOrderAtCheckout(
	page: Page,
	trackOrder: (order: TrackedOrder) => void
): Promise<{ orderId: number; uuid: string; mode: 'tender' | 'legacy'; cartTotal: string }> {
	const added = await tryAddRunPrivateSimpleProduct(page);
	liveTest.skip(!added, 'product-writer credentials are unavailable');
	const label = newRunLabel();
	await stampRunLabel(page, label);
	const { total: cartTotal } = await readCartMoney(page);
	const { orderId, uuid, mode } = await openCheckout(page, (order) =>
		trackOrder({ ...order, label })
	);
	return { orderId, uuid, mode, cartTotal };
}

/** Tap a tile, then key in an exact minor-unit amount (digits shift in from the right). */
async function enterAmount(page: Page, methodId: string, amountMinor: number): Promise<void> {
	await page.getByTestId(`checkout-tile-${methodId}`).click();
	await expect(page.getByTestId('checkout-keypad')).toBeVisible({ timeout: 15_000 });
	await page.getByTestId('checkout-key-clear').click();
	for (const digit of String(amountMinor)) {
		await page.getByTestId(`checkout-key-${digit}`).click();
	}
	await expect
		.poll(() => readAmountMinor(page, 'checkout-entry'), { timeout: 10_000 })
		.toBe(amountMinor);
}

/* -------------------------------------------------------------------------- */
/* Tests                                                                      */
/* -------------------------------------------------------------------------- */

liveTest.describe('POS two-pane checkout (live store)', () => {
	// eslint-disable-next-line no-empty-pattern -- Playwright requires object destructuring for fixtures.
	liveTest.beforeEach(async ({}, testInfo) => {
		// Pro only: the free dev store is not guaranteed to carry the payments contract.
		liveTest.skip(getStoreVariant(testInfo) !== 'pro', 'tender checkout smoke runs on Pro');
	});

	liveTest(
		'renders the tender checkout with the order balance',
		async ({ posPage: page, trackOrder, storeAuthorization, request }, testInfo) => {
			liveTest.slow();
			const { orderId, mode, cartTotal } = await newOrderAtCheckout(page, trackOrder);
			const { authorization } = await requireTenderCheckout(
				request,
				testInfo,
				storeAuthorization,
				mode
			);

			const balance = await readAmountMinor(page, 'checkout-balance');
			const total = await readAmountMinor(page, 'checkout-order-total');
			expect(balance, 'a fresh order owes its whole total').toBe(total);
			expect(balance, 'checkout must show a non-zero balance').toBeGreaterThan(0);
			const server = await readOrder(request, testInfo, authorization, orderId);
			expect(Number(server.total), 'server total must equal the cart total').toBe(
				Number(cartTotal)
			);
		}
	);

	liveTest(
		'takes the full balance in cash and the server records one captured leg',
		async ({ posPage: page, trackOrder, storeAuthorization, request }, testInfo) => {
			liveTest.slow();
			const { orderId, mode } = await newOrderAtCheckout(page, trackOrder);
			const { authorization, descriptors } = await requireTenderCheckout(
				request,
				testInfo,
				storeAuthorization,
				mode
			);
			const cash = manualMethods(descriptors).find((method) => method.kind === 'cash');
			liveTest.skip(!cash, 'store declares no manual cash method');

			const balance = await readAmountMinor(page, 'checkout-balance');
			await page.getByTestId(`checkout-tile-${cash!.id}`).click();
			// The keypad opens pre-filled with the balance — the cashier confirms, never retypes.
			await expect
				.poll(() => readAmountMinor(page, 'checkout-entry'), { timeout: 15_000 })
				.toBe(balance);

			await clickAndExpectPaymentWrite(page, 'checkout-take-payment', orderId, 'record');

			await expect(page.getByTestId('checkout-receipt-stage')).toBeVisible({ timeout: 120_000 });
			await expect(page.getByTestId('receipt-paid-banner')).toBeVisible();
			await page.getByTestId('receipt-new-sale').click();
			await expect(page.getByTestId('checkout-tender-pane')).toBeHidden({ timeout: 30_000 });
			await expect(
				page.getByTestId('pos-products-panel').getByTestId('search-products')
			).toBeVisible({ timeout: 30_000 });

			const server = await pollOrder(
				request,
				testInfo,
				authorization,
				orderId,
				(order) => ledgerRows(order).length === 1,
				'the server must record exactly one payment leg'
			);
			expectOrderPaid(server);
			const [row] = ledgerRows(server);
			expect(row.method_id, 'the leg must name the cash method that was tapped').toBe(cash!.id);
			expect(row.status, 'a manual cash leg is captured on the spot').toBe('captured');
			expect(Number(row.amount), 'the leg must equal the order total').toBeCloseTo(
				Number(server.total),
				2
			);
		}
	);

	liveTest(
		'splits a payment across two tenders and the server records both legs',
		async ({ posPage: page, trackOrder, storeAuthorization, request }, testInfo) => {
			liveTest.slow();
			const { orderId, mode } = await newOrderAtCheckout(page, trackOrder);
			const { authorization, descriptors } = await requireTenderCheckout(
				request,
				testInfo,
				storeAuthorization,
				mode
			);
			const manual = manualMethods(descriptors);
			const cash = manual.find((method) => method.kind === 'cash');
			liveTest.skip(!cash, 'store declares no manual cash method');
			const second = manual.find((method) => method.id !== cash!.id);
			liveTest.skip(!second, 'store declares no distinct second manual payment method');
			log.debug(`[checkout-tender] split legs: ${cash!.id} then ${second!.id}`);

			const balance = await readAmountMinor(page, 'checkout-balance');
			const part = Math.floor(balance / 2);
			expect(part, 'the probe order must be big enough to split').toBeGreaterThan(0);

			await enterAmount(page, cash!.id, part);
			await clickAndExpectPaymentWrite(page, 'checkout-take-payment', orderId, 'record');

			// The balance falls by exactly what was taken, and the ledger shows the one leg.
			await expect
				.poll(() => readAmountMinor(page, 'checkout-balance'), { timeout: 60_000 })
				.toBe(balance - part);
			await expect(page.locator('[data-testid^="checkout-leg-"]')).toHaveCount(1);

			await page.getByTestId(`checkout-tile-${second!.id}`).click();
			// Pre-filled with the REMAINING balance, so the second leg closes the order.
			await expect
				.poll(() => readAmountMinor(page, 'checkout-entry'), { timeout: 15_000 })
				.toBe(balance - part);
			await clickAndExpectPaymentWrite(page, 'checkout-take-payment', orderId, 'record');

			await expect(page.getByTestId('checkout-receipt-stage')).toBeVisible({ timeout: 120_000 });
			await expect(page.getByTestId('receipt-paid-banner')).toBeVisible();
			await page.getByTestId('receipt-new-sale').click();
			await expect(page.getByTestId('checkout-tender-pane')).toBeHidden({ timeout: 30_000 });
			await expect(
				page.getByTestId('pos-products-panel').getByTestId('search-products')
			).toBeVisible({ timeout: 30_000 });

			const server = await pollOrder(
				request,
				testInfo,
				authorization,
				orderId,
				(order) => ledgerRows(order).length === 2,
				'the server must record both split legs'
			);
			expectOrderPaid(server);
			const rows = ledgerRows(server);
			expect(rows.map((row) => row.status)).toEqual(['captured', 'captured']);
			expect(rows.map((row) => row.method_id)).toEqual([cash!.id, second!.id]);
			expect(new Set(rows.map((row) => row.method_id)).size).toBe(2);
			const paid = rows.reduce((sum, row) => sum + Number(row.amount), 0);
			expect(paid, 'the two legs must add up to the order total').toBeCloseTo(
				Number(server.total),
				2
			);
		}
	);

	liveTest(
		'preserves a partly paid cart while a second cart completes checkout',
		async ({ posPage: page, trackOrder, storeAuthorization, request }, testInfo) => {
			liveTest.slow();
			const orderA = await newOrderAtCheckout(page, trackOrder);
			const { descriptors } = await requireTenderCheckout(
				request,
				testInfo,
				storeAuthorization,
				orderA.mode
			);
			const manual = manualMethods(descriptors);
			liveTest.skip(manual.length < 1, 'store declares no manual payment method');
			const cash = manual.find((method) => method.kind === 'cash');
			liveTest.skip(!cash, 'store declares no manual cash method');

			const balance = await readAmountMinor(page, 'checkout-balance');
			const part = Math.floor(balance / 2);
			expect(part, 'the probe order must be big enough to part-pay').toBeGreaterThan(0);
			await enterAmount(page, cash!.id, part);
			await clickAndExpectPaymentWrite(page, 'checkout-take-payment', orderA.orderId, 'record');
			const ledgerRow = page.getByTestId('checkout-ledger').getByTestId(/^checkout-leg-/);
			await expect(ledgerRow).toHaveCount(1);
			const legTestId = await ledgerRow.getAttribute('data-testid');
			expect(legTestId).toMatch(/^checkout-leg-.+/);
			await expect
				.poll(() => readAmountMinor(page, 'checkout-ledger-remaining'), { timeout: 60_000 })
				.toBe(balance - part);
			const remaining = await readAmountMinor(page, 'checkout-ledger-remaining');
			expect(remaining).toBeGreaterThan(0);

			await page.getByTestId('new-order-tab').click();
			await addCheckoutProbeProductAgain(page);
			const labelB = newRunLabel();
			await stampRunLabel(page, labelB);
			await readCartMoney(page);
			const orderB = await openCheckout(page, (order) => trackOrder({ ...order, label: labelB }));
			expect(orderB.mode).toBe('tender');
			expect(orderB.uuid).not.toBe(orderA.uuid);
			const balanceB = await readAmountMinor(page, 'checkout-balance');
			expect(balanceB).toBeGreaterThan(0);
			await enterAmount(page, cash!.id, balanceB);
			await clickAndExpectPaymentWrite(page, 'checkout-take-payment', orderB.orderId, 'record');
			await expect(page.getByTestId('checkout-receipt-stage')).toBeVisible({ timeout: 120_000 });
			await expect(page.getByTestId('receipt-paid-banner')).toBeVisible();
			await page.getByTestId('receipt-new-sale').click();
			await expect(page.getByTestId(`open-order-tab-${orderB.uuid}`)).toBeHidden();
			await expect(page.getByTestId('checkout-tender-pane')).toBeHidden();
			await expect(
				page.getByTestId('pos-products-panel').getByTestId('search-products')
			).toBeVisible({ timeout: 30_000 });

			const tabA = page.getByTestId(`open-order-tab-${orderA.uuid}`);
			await expect(tabA).toBeVisible();
			await expect(tabA.getByTestId(`open-order-chip-${orderA.uuid}`)).toBeVisible();
			await tabA.click();
			await expect(page.getByTestId('checkout-tender-pane')).toBeVisible();
			await expect(page.getByTestId('checkout-server-order-id')).toHaveText(String(orderA.orderId));
			await expect(ledgerRow).toHaveCount(1);
			await expect(page.getByTestId(legTestId!)).toBeVisible();
			await expect.poll(() => readAmountMinor(page, 'checkout-ledger-remaining')).toBe(remaining);
			await expect.poll(() => readAmountMinor(page, 'checkout-balance')).toBe(remaining);
			await enterAmount(page, cash!.id, remaining);
			await clickAndExpectPaymentWrite(page, 'checkout-take-payment', orderA.orderId, 'record');
			await expect(page.getByTestId('checkout-receipt-stage')).toBeVisible({ timeout: 120_000 });
			await expect(page.getByTestId('receipt-paid-banner')).toBeVisible();
			await page.getByTestId('receipt-new-sale').click();
			await expect(page.getByTestId(`open-order-tab-${orderA.uuid}`)).toBeHidden();
			await expect(page.getByTestId('checkout-tender-pane')).toBeHidden();
			await expect(
				page.getByTestId('pos-products-panel').getByTestId('search-products')
			).toBeVisible({ timeout: 30_000 });
		}
	);

	liveTest(
		'cancels mid-split, listing the cash to return, and voids the leg',
		async ({ posPage: page, trackOrder, storeAuthorization, request }, testInfo) => {
			liveTest.slow();
			const { orderId, mode } = await newOrderAtCheckout(page, trackOrder);
			const { authorization, descriptors } = await requireTenderCheckout(
				request,
				testInfo,
				storeAuthorization,
				mode
			);
			const cash = manualMethods(descriptors).find((method) => method.kind === 'cash');
			liveTest.skip(!cash, 'store declares no manual cash method');

			const balance = await readAmountMinor(page, 'checkout-balance');
			const part = Math.floor(balance / 2);
			expect(part, 'the probe order must be big enough to part-pay').toBeGreaterThan(0);

			await enterAmount(page, cash!.id, part);
			await clickAndExpectPaymentWrite(page, 'checkout-take-payment', orderId, 'record');
			await expect
				.poll(() => readAmountMinor(page, 'checkout-balance'), { timeout: 60_000 })
				.toBe(balance - part);
			const ledgerRow = page.locator('[data-testid^="checkout-leg-"]');
			await expect(ledgerRow).toHaveCount(1);
			const ledgerTestId = await ledgerRow.getAttribute('data-testid');
			expect(ledgerTestId, 'the cash ledger row must expose its stable row id').toMatch(
				/^checkout-leg-.+/
			);
			const rowId = ledgerTestId!.replace(/^checkout-leg-/, '');

			await page.getByTestId('checkout-cancel-payment').click();
			// Cancelling is a physical act first: the cash taken must be listed to be returned.
			const cancelRow = page.getByTestId(`checkout-cancel-leg-${rowId}`);
			await expect(cancelRow).toHaveCount(1);
			expect(
				digitsOf((await cancelRow.textContent()) ?? ''),
				'the cancellation view must show the exact cash amount to return'
			).toBe(String(part));
			await clickAndExpectPaymentWrite(page, 'checkout-cancel-confirm', orderId, 'void');

			await expect(page.getByTestId('checkout-tender-pane')).toBeHidden({ timeout: 30_000 });
			await expect(
				page.getByTestId('pos-products-panel').getByTestId('search-products')
			).toBeVisible({ timeout: 30_000 });

			const server = await pollOrder(
				request,
				testInfo,
				authorization,
				orderId,
				(order) => {
					const rows = ledgerRows(order);
					return rows.length === 1 && rows.every((row) => row.status === 'voided');
				},
				'the cancelled leg must be voided on the server'
			);
			const rows = ledgerRows(server);
			expect(rows, 'the voided leg stays on the ledger as a record').toHaveLength(1);
			expect(rows[0].method_id).toBe(cash!.id);
			expect(rows[0].status).toBe('voided');
			expect(
				String(server.status ?? '').replace(/^wc-/, ''),
				'a cancelled payment returns the order to the open till'
			).toBe('pos-open');
		}
	);
});
