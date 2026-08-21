import { expect, type Page } from '@playwright/test';

import { isolatedProductTest as test, tryAddRunPrivateSimpleProduct } from './checkout-probe';
import { becomesVisible, getStoreVariant, tryAddProductBySku } from './fixtures';
import {
	expectFullPrecision,
	expectMoneyMatches,
	expectOrderPaid,
	expectTaxParity,
	liveOrderTest as liveTest,
	newRunLabel,
	openCheckout,
	processPayment,
	readOrder,
	stampRunLabel,
} from './order-lifecycle';

/**
 * Add the dedicated E2E product to the cart. Falls back to the first catalogue
 * product — and then to a misc product — on stores without the dedicated SKU.
 */
async function addTestProductToCart(page: Page) {
	if (await tryAddRunPrivateSimpleProduct(page)) return;

	// Secretless forks retain the pre-isolation shared-SKU/misc-product path below.
	const skuResult = await tryAddProductBySku(page);
	if (skuResult === 'added') {
		return;
	}
	if (skuResult === 'add_failed') {
		throw new Error('Dedicated E2E SKU matched but did not reach the cart');
	}

	const tile = page.getByTestId('product-tile').first();
	const tableButton = page.getByTestId('add-to-cart-button').first();
	const productMarker = tile.or(tableButton).first();

	// `becomesVisible` waits for the catalogue to render; `isVisible({ timeout })`
	// samples once and ignores its timeout, so a slow render would wrongly fall
	// through to the misc-product branch below (#1044).
	const hasCatalogProduct = await becomesVisible(productMarker, 30_000);

	// Both markers have settled once `hasCatalogProduct` is true; a one-shot picks
	// which view rendered.
	if (hasCatalogProduct && (await tile.isVisible())) {
		await tile.click();
	} else if (hasCatalogProduct) {
		await tableButton.click();
	} else {
		await page.getByTestId('add-cart-item-menu').click();
		await page.getByTestId('menu-add-misc-product').click();
		const priceInput = page.getByTestId('misc-product-price-input');
		await expect(priceInput).toBeVisible({ timeout: 15_000 });
		await priceInput.click();
		const numpad = page.locator('[data-radix-popper-content-wrapper]').first();
		await expect(numpad).toBeVisible({ timeout: 15_000 });
		const numpadInput = numpad.locator('input');
		await numpadInput.fill('15');
		await page.getByTestId('numpad-done-button').click();
		await page.getByTestId('add-to-cart-submit').click();
	}
	await expect(page.getByTestId('checkout-button')).toBeVisible({
		timeout: 15_000,
	});
}

/**
 * Build an order and stop at the checkout modal.
 *
 * Only used by the two STUBBED contract tests below — with push/orders
 * intercepted, this order never reaches the server and no payment is taken, so
 * the "completed order" they refund is a fixture, not a sale.
 */
async function createRefundableOrder(page: Page) {
	await addTestProductToCart(page);
	const gatewaysLoaded = page.waitForResponse('**/wp-json/wcpos/v2/payment-gateways{,?*}', {
		timeout: 90_000,
	});
	gatewaysLoaded.catch(() => {});
	await openCheckout(page);
	await gatewaysLoaded;
	await expect(page.getByTestId('process-payment-button')).toBeDisabled();

	const orderUuid = page.url().match(/\/cart\/([^/]+)\/checkout$/)?.[1];
	expect(orderUuid).toBeTruthy();

	return orderUuid!;
}

async function interceptRefundDependencies(page: Page) {
	const unsupportedProviderRefundGatewayId = 'unsupported_provider_refunds';
	let orderRevision = 0;
	const capturedOrder = { total: 0 };
	const gatewayIds = [
		unsupportedProviderRefundGatewayId,
		'stripe_terminal_for_woocommerce',
		'wcpos_cash',
		'pos_cash',
		'cash',
		'cod',
		'cash_on_delivery',
		'bacs',
		'cheque',
		'',
		'wcpos_card',
		'pos_card',
		'woocommerce_payments',
		'wcpay',
		'stripe',
		'stripe_terminal',
		'stripe_cc',
		'woocommerce_payments_pos',
		'square_credit_card',
		'square_cash_app_pay',
	];

	await page.route('**/payment-gateways**', async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(
				gatewayIds.map((id) => ({
					id,
					title: id || 'Default payment gateway',
					capabilities: {
						supports_provider_refunds: id !== unsupportedProviderRefundGatewayId,
						supports_checkout: true,
					},
				}))
			),
		});
	});

	const isPushOrders = (url: URL) =>
		url.pathname.endsWith('/wp-json/wcpos/v2/push/orders') ||
		url.searchParams.get('rest_route') === '/wcpos/v2/push/orders';
	await page.route(isPushOrders, async (route) => {
		const mutation = route.request().postDataJSON() as {
			operation: 'create' | 'update';
			payload: Record<string, unknown>;
		};
		const currentRevision = `sha256:e2e-refund-${++orderRevision}`;
		if (mutation.operation === 'create') {
			capturedOrder.total = Number(mutation.payload.total);
		}

		await route.fulfill({
			status: mutation.operation === 'create' ? 201 : 200,
			contentType: 'application/json',
			body: JSON.stringify({
				document: { ...mutation.payload, id: 999_001 },
				currentRevision,
			}),
		});
	});

	return capturedOrder;
}

async function openRefundModalForNewOrder(page: Page) {
	const capturedOrder = await interceptRefundDependencies(page);
	const orderUuid = await createRefundableOrder(page);
	await page.goto(`/orders/refund/${orderUuid}`);
	await expect(page.getByTestId('refund-custom-amount')).toBeVisible({
		timeout: 30_000,
	});
	expect(capturedOrder.total, 'stubbed order must have a refundable total').toBeGreaterThan(0);
	await page.getByTestId('refund-custom-amount').fill(Math.min(capturedOrder.total, 1).toFixed(2));
}

/** The refund body the POS submits — see `buildRefundPayload` in use-refund-mutation.ts. */
interface RefundRequestPayload {
	amount?: string;
	reason?: string;
	refund_destination?: string;
	api_refund?: boolean;
	line_items?: unknown[];
}

/**
 * The stubbed tests below assert the REQUEST CONTRACT — that the destination the
 * cashier picks becomes the right `refund_destination` / `api_refund` pair for a
 * given gateway capability matrix. They stub the gateway list on purpose: a
 * single live store advertises one capability set, so the matrix (including a
 * gateway that does NOT support provider refunds) is not reachable against
 * dev-next. They are contract tests and are labelled as such.
 *
 * What they never proved is that a refund works at all. That is what
 * `POS refunds (Pro) - real refund` below does, against the live store.
 */
test.describe('POS refunds (Pro)', () => {
	// eslint-disable-next-line no-empty-pattern -- Playwright requires object destructuring for fixtures.
	test.beforeEach(async ({}, testInfo) => {
		test.skip(getStoreVariant(testInfo) !== 'pro', 'Refund UI requires Pro');
	});

	test('submits refund_destination=cash for a non-cash order', async ({ posPage: page }) => {
		const captured: { refund: RefundRequestPayload | null } = { refund: null };
		await page.route('**/wp-json/wcpos/v2/orders/*/refunds**', async (route) => {
			if (route.request().method() !== 'POST') {
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					headers: { 'x-wp-totalpages': '1' },
					body: JSON.stringify([]),
				});
				return;
			}

			captured.refund = route.request().postDataJSON() as RefundRequestPayload;
			await route.fulfill({
				status: 201,
				contentType: 'application/json',
				body: JSON.stringify({
					refund_id: 999,
					refund_result: { destination: 'cash', mode: 'manual' },
				}),
			});
		});

		await openRefundModalForNewOrder(page);
		await expect(page.getByTestId('refund-destination-original_method')).toBeChecked({
			timeout: 15_000,
		});
		await expect(page.getByTestId('refund-destination-cash')).toBeVisible({
			timeout: 15_000,
		});
		await page.getByTestId('refund-destination-cash').click();
		await expect(page.getByTestId('refund-destination-cash')).toBeChecked();
		await page.getByTestId('process-refund-button').click();
		await expect(page.getByTestId('confirm-process-refund-button')).toBeVisible({
			timeout: 10_000,
		});
		await page.getByTestId('confirm-process-refund-button').click();

		await expect.poll(() => captured.refund?.refund_destination, { timeout: 15_000 }).toBe('cash');
		expect(captured.refund?.api_refund).toBe(false);
	});

	test('submits refund_destination=original_method when provider refunds are supported', async ({
		posPage: page,
	}) => {
		const captured: { refund: RefundRequestPayload | null } = { refund: null };
		await page.route('**/wp-json/wcpos/v2/orders/*/refunds**', async (route) => {
			if (route.request().method() !== 'POST') {
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					headers: { 'x-wp-totalpages': '1' },
					body: JSON.stringify([]),
				});
				return;
			}

			captured.refund = route.request().postDataJSON() as RefundRequestPayload;
			await route.fulfill({
				status: 201,
				contentType: 'application/json',
				body: JSON.stringify({
					refund_id: 1000,
					refund_result: { destination: 'original_method', mode: 'provider' },
				}),
			});
		});

		await openRefundModalForNewOrder(page);
		await expect(page.getByTestId('refund-destination-original_method')).toBeChecked({
			timeout: 15_000,
		});
		await expect(page.getByTestId('refund-destination-original_method')).toBeEnabled();
		await page.getByTestId('refund-destination-original_method').click();
		await page.getByTestId('process-refund-button').click();
		await expect(page.getByTestId('confirm-process-refund-button')).toBeVisible({
			timeout: 10_000,
		});
		await page.getByTestId('confirm-process-refund-button').click();

		await expect
			.poll(() => captured.refund?.refund_destination, { timeout: 15_000 })
			.toBe('original_method');
		expect(captured.refund?.api_refund).toBe(true);
	});
});

/**
 * A REAL refund against the live store — completes a genuine payment, refunds
 * part of it, and reads the refund back from the server.
 *
 * Writes to the shared store, so it follows the labelling + cleanup contract in
 * order-lifecycle.ts. No stubs at all: the gateway list, the payment and the
 * refund POST all go to dev-next.
 */
liveTest.describe('POS refunds (Pro) - real refund (live store)', () => {
	// eslint-disable-next-line no-empty-pattern -- Playwright requires object destructuring for fixtures.
	liveTest.beforeEach(async ({}, testInfo) => {
		liveTest.skip(getStoreVariant(testInfo) !== 'pro', 'Refund UI requires Pro');
	});

	liveTest(
		'refunds a completed order and the server records the refund',
		async ({ posPage: page, storeAuthorization, trackOrder, request }, testInfo) => {
			// Payment plus refund is two full live round-trips on top of the cart build.
			liveTest.slow();

			const label = newRunLabel();

			await addTestProductToCart(page);
			await stampRunLabel(page, label);

			const { orderId, uuid, sent } = await openCheckout(page, {
				onOrderCreated: (order) => trackOrder({ ...order, label }),
			});

			await processPayment(page);

			// Guard the premise: refunding an order that never got paid would pass for
			// the wrong reason.
			const paid = await readOrder(request, testInfo, storeAuthorization(), orderId);
			expect(paid.customer_note, 'must refund the order this test created').toBe(label);

			// Totals parity on the SALE half (Money-oracle doctrine in TEST-PLAN.md):
			// the order this test refunds must first be a correctly-recorded sale —
			// otherwise "half of a wrong total" both computes and proves nothing.
			if (sent.total !== undefined) {
				expectMoneyMatches(paid.total, sent.total, 'parent order total parity (cart vs server)');
			}
			if (sent.cart_tax !== undefined) {
				expectTaxParity(paid.cart_tax, sent.cart_tax, 'parent cart_tax parity');
			}
			const orderTotal = Number(paid.total);
			const refundAmount = (orderTotal / 2).toFixed(2);
			// WooCommerce will record a refund against an order that never took
			// payment, so "not pos-open" would let this test pass while covering only
			// half of the payment-then-refund lifecycle it is named for.
			expectOrderPaid(paid);
			expect(
				orderTotal,
				`refund of ${refundAmount} must not exceed the order total`
			).toBeGreaterThan(Number(refundAmount));

			await page.goto(`/orders/refund/${uuid}`);
			const amountInput = page.getByTestId('refund-custom-amount');
			await expect(amountInput).toBeVisible({ timeout: 60_000 });
			await amountInput.fill(refundAmount);

			const refunded = page.waitForResponse(
				(response) =>
					/\/wp-json\/wcpos\/v2\/orders\/\d+\/refunds/.test(response.url()) &&
					response.request().method() === 'POST',
				{ timeout: 90_000 }
			);
			refunded.catch(() => {});

			await page.getByTestId('process-refund-button').click();
			const confirm = page.getByTestId('confirm-process-refund-button');
			await expect(confirm).toBeVisible({ timeout: 15_000 });
			await confirm.click();

			const response = await refunded;
			expect(response.status(), 'refund POST must succeed').toBeLessThan(400);

			// SERVER TRUTH. Poll rather than read once: WooCommerce writes the refund
			// row and recalculates the parent order in the same request, but the order
			// readback is a separate query that can observe the pre-refund row if it
			// lands first.
			//
			// The refund shows up as a child row in `refunds[]`. This route does NOT
			// expose `total_refunded` (verified against dev-next 2026-08-06 — the
			// payload has no such key), so asserting on it would silently pass `0` for
			// ever and prove nothing.
			await expect
				.poll(
					async () => {
						// A failed read is "not yet", not a verdict — keep polling.
						const order = await readOrder(request, testInfo, storeAuthorization(), orderId).catch(
							() => null
						);
						return (order?.refunds ?? []).length;
					},
					{ timeout: 60_000, message: `order ${orderId} must show the refund server-side` }
				)
				.toBe(1);

			const afterRefund = await readOrder(request, testInfo, storeAuthorization(), orderId);
			expect(afterRefund.customer_note, 'still the order this test created').toBe(label);

			// WooCommerce stores refunds as negative amounts against the parent order.
			const refunds = afterRefund.refunds ?? [];
			expect(refunds, 'exactly the one refund this test made').toHaveLength(1);
			const refund = refunds[0];
			expect(Number(refund.total), 'a refund must be recorded as a negative amount').toBeLessThan(
				0
			);
			expect(Math.abs(Number(refund.total)), 'refunded amount').toBeCloseTo(
				Number(refundAmount),
				2
			);
			expectFullPrecision(refund.total, 'refunds[0].total');

			// The parent's stored money must not have been silently rewritten by the
			// refund: the refund lives in refunds[], the parent total stays the sale
			// total (WooCommerce semantics — total_refunded is derived, not applied).
			expectMoneyMatches(afterRefund.total, paid.total, 'parent total unchanged by refund');
		}
	);
});
