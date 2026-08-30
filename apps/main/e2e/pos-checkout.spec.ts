import { expect, type Locator, type Page } from '@playwright/test';

import { isolatedProductTest as test, tryAddRunPrivateSimpleProduct } from './checkout-probe';
import {
	becomesVisible,
	getStoreUrl,
	isRouteTeardownError,
	isWcposRestRoute,
	tryAddProductBySku,
	wcposRestRoute,
} from './fixtures';
import { resolveProbeAuthorization } from './probe-credential';
import {
	expectFullPrecision,
	expectMoneyMatches,
	expectOrderPaid,
	expectRateSetParity,
	expectTaxParity,
	liveOrderTest as liveTest,
	newRunLabel,
	openCheckout,
	type OrderLineItem,
	posAppliedRateIds,
	processPayment,
	readCartMoney,
	readOrder,
	stampRunLabel,
} from './order-lifecycle';

/** The gateway list, in both permalink spellings. */
function isPaymentGatewaysUrl(url: URL): boolean {
	return isWcposRestRoute(url.href, '/wcpos/v2/payment-gateways');
}

/** A gateway's checkout-contract bootstrap, in both permalink spellings. */
function isGatewayBootstrapUrl(url: URL): boolean {
	return /^\/wcpos\/v2\/payment-gateways\/[^/]+\/bootstrap$/.test(wcposRestRoute(url.href) ?? '');
}

/** An order's checkout-contract call, in both permalink spellings. */
function isOrderCheckoutUrl(url: URL): boolean {
	return /^\/wcpos\/v2\/orders\/[^/]+\/checkout$/.test(wcposRestRoute(url.href) ?? '');
}

/**
 * Wait for the payment-gateways fetch the checkout modal fires on mount.
 *
 * Must be created BEFORE the modal opens, so the listener is attached in time.
 * The no-op catch keeps a still-pending wait from surfacing as an unhandled
 * rejection when an earlier step fails the test — an unhandled rejection here
 * takes down the whole worker process (see #997).
 */
function gatewaysResponse(page: Page) {
	const pending = page.waitForResponse(
		(response) => isWcposRestRoute(response.url(), '/wcpos/v2/payment-gateways'),
		{ timeout: 90_000 }
	);
	pending.catch(() => {});
	return pending;
}

/**
 * Digits only, so an amount can be compared across currency and locale formats
 * without selecting on text: `45.00`, `45,00 £` and `£45.00` all reduce to
 * `4500`, and `1,234.56` / `1.234,56` both reduce to `123456`.
 */
function digitsOf(value: string): string {
	return value.replace(/\D/g, '');
}

/**
 * Add the dedicated E2E product to the cart, falling back to the first simple
 * product in the catalogue when the store does not carry the dedicated SKU.
 * Works in both grid and table view.
 */
async function addTestProductToCart(page: Page) {
	if (await tryAddRunPrivateSimpleProduct(page)) return;

	// Secretless forks retain the pre-isolation shared-SKU path below.
	const skuResult = await tryAddProductBySku(page);
	if (skuResult === 'added') {
		return;
	}
	if (skuResult === 'add_failed') {
		throw new Error('Dedicated E2E SKU matched but did not reach the cart');
	}

	const tile = page.getByTestId('product-tile').first();
	const tableButton = page.getByTestId('add-to-cart-button').first();
	const productMarker = tile.or(tableButton);

	// Wait for products to render in whichever view mode is active. `becomesVisible`
	// actually waits — `isVisible({ timeout })` samples once and ignores its timeout,
	// so a slow catalogue would wrongly route to the error-boundary recovery branch.
	let productsVisible = await becomesVisible(productMarker, 30_000);
	if (
		!productsVisible &&
		(await page
			.getByTestId('error-boundary-fallback')
			.isVisible()
			.catch(() => false))
	) {
		await page.reload();
		await expect(page.getByTestId('search-products')).toBeVisible({
			timeout: 60_000,
		});
		productsVisible = await becomesVisible(productMarker, 60_000);
	}
	await expect(productMarker).toBeVisible({
		timeout: productsVisible ? 1_000 : 60_000,
	});

	// Both markers already settled via the assertion above; a one-shot picks which
	// view (grid tile vs table button) rendered.
	if (await tile.isVisible()) {
		await tile.click();
	} else {
		await tableButton.click();
	}
	await expect(page.getByTestId('checkout-button')).toBeVisible({
		timeout: 10_000,
	});
}

// Keep the server-omits-payment-link premise independent of woocommerce-pos#1352's ack shape.
async function omitPaymentLinkFromPushAcks(page: Page) {
	const isPushOrders = (url: URL) =>
		url.pathname.endsWith('/wp-json/wcpos/v2/push/orders') ||
		url.searchParams.get('rest_route') === '/wcpos/v2/push/orders';
	await page.route(isPushOrders, async (route) => {
		try {
			const response = await route.fetch();
			let body: { document?: { links?: { payment?: unknown } } };
			try {
				body = await response.json();
			} catch {
				// Not JSON (e.g. a transient wp-env error page). Pass the original
				// response through so only this test sees the failure.
				await route.fulfill({ response });
				return;
			}
			delete body?.document?.links?.payment;
			await route.fulfill({ response, json: body });
		} catch (error) {
			if (isRouteTeardownError(error)) {
				return;
			}
			// Throwing from a route handler surfaces as an unhandled rejection and
			// kills the whole worker process (every test in the shard fails).
			console.warn('[omitPaymentLinkFromPushAcks] Route handler failed; aborting request:', error);
			await route.abort().catch(() => {});
		}
	});
}

async function isSwitchEnabled(toggle: Locator): Promise<boolean> {
	return toggle.evaluate((node) => {
		const element = node as HTMLElement & { checked?: boolean };
		const ariaChecked = element.getAttribute('aria-checked');
		if (ariaChecked !== null) {
			return ariaChecked === 'true';
		}

		const dataState = element.getAttribute('data-state');
		if (dataState !== null) {
			return dataState === 'checked';
		}

		return element.checked === true;
	});
}

async function ensureSwitchEnabled(toggle: Locator) {
	await expect(toggle).toBeVisible({ timeout: 15_000 });
	if (!(await isSwitchEnabled(toggle))) {
		await toggle.click();
	}
	await expect.poll(() => isSwitchEnabled(toggle), { timeout: 10_000 }).toBe(true);
}

/**
 * Configure POS cart UI settings from the UI itself rather than mutating
 * storage internals. This is resilient across storage backend migrations.
 */
async function enableAutoReceiptSettings(page: Page) {
	await page.getByTestId('cart-settings-button').click();

	await ensureSwitchEnabled(page.getByTestId('cart-setting-auto-show-receipt').first());
	await ensureSwitchEnabled(page.getByTestId('cart-setting-auto-print-receipt').first());

	// Close settings dialog and continue with updated persisted UI settings.
	await page.keyboard.press('Escape');
}

test.describe('POS Cart - Order Actions', () => {
	test('should save order to server', async ({ posPage: page }) => {
		await addTestProductToCart(page);

		await page.getByTestId('save-to-server-button').click();

		// Wait for the save button to finish loading (loading state resolves when save completes)
		await expect(page.getByTestId('save-to-server-button')).toBeEnabled({
			timeout: 30_000,
		});
		// Verify a success toast appeared (Sonner toast)
		await expect(page.getByTestId('success-toast').first()).toBeVisible({
			timeout: 10_000,
		});
	});

	test('should add order note', async ({ posPage: page }) => {
		await addTestProductToCart(page);

		await page.getByTestId('order-note-button').click();

		const textarea = page.locator('textarea').first();
		await expect(textarea).toBeVisible({ timeout: 15_000 });
		await textarea.fill('Test order note from e2e');

		const addNoteButton = page.getByTestId('add-note-button');
		await expect(addNoteButton).toBeVisible({ timeout: 15_000 });
		await addNoteButton.click();
	});

	test('should open order meta dialog', async ({ posPage: page }) => {
		await addTestProductToCart(page);

		await page.getByTestId('order-meta-button').click();

		await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });
	});
});

test.describe('POS Cart - Multiple Orders', () => {
	test('should create a new order via tab', async ({ posPage: page }) => {
		await addTestProductToCart(page);

		// The new order button is a TabsTrigger with a plus icon
		// It's a tab element with value="new" containing an Icon with name="plus"
		// The tooltip text is "Open new order"
		const newOrderTab = page
			.getByRole('tab')
			.filter({ has: page.locator('svg') })
			.last()
			.or(page.locator('[role="tab"]').filter({ hasText: '+' }))
			.or(page.locator('[data-state]').filter({ has: page.locator('[name="plus"]') }));

		await expect(newOrderTab).toBeVisible({ timeout: 15_000 });
		await newOrderTab.click();

		// Wait for cart transition animation
		await page.waitForTimeout(1_000);

		// New order should have empty cart (no checkout button visible)
		await expect(page.getByTestId('checkout-button')).not.toBeVisible({
			timeout: 15_000,
		});
	});
});

test.describe('POS Checkout', () => {
	test('should open checkout modal', async ({ posPage: page }) => {
		await addTestProductToCart(page);

		await openCheckout(page);
	});

	test('should show order total in checkout', async ({ posPage: page }) => {
		await addTestProductToCart(page);

		await openCheckout(page);

		// The modal must show the same amount the cart's Pay button shows. The old
		// assertion here only checked that a cancel button was visible, which would
		// not have noticed a modal showing 0.00 or one bound to a different order.
		//
		// Both are read AFTER the save: saving re-anchors the order on the server's
		// own totals (this store adds a surcharge at save time, so the cart legitimately
		// moves from 45.00 to 50.07), and the POS mirrors that — comparing against a
		// pre-save snapshot would be asserting that the server is not allowed to
		// recalculate, which is the opposite of the house rule.
		const amount = page.getByTestId('checkout-amount-to-pay');
		await expect(amount).toBeVisible({ timeout: 15_000 });

		// Compared as digits so the assertion holds in whatever currency and locale
		// the store under test is configured for.
		const shown = digitsOf((await amount.textContent()) ?? '');
		const cartTotal = digitsOf((await page.getByTestId('checkout-button').textContent()) ?? '');
		expect(Number(shown), 'checkout must show a non-zero amount').toBeGreaterThan(0);
		expect(shown, 'checkout must show the same total as the cart').toBe(cartTotal);
		await expect(page.getByTestId('cancel-checkout-button')).toBeVisible();
	});

	test('should cancel checkout and return to cart', async ({ posPage: page }) => {
		await addTestProductToCart(page);

		await openCheckout(page);

		await page.getByTestId('cancel-checkout-button').click();

		await expect(page.getByTestId('checkout-button')).toBeVisible({
			timeout: 15_000,
		});
	});

	test('should disable payment when the server omits the payment link', async ({
		posPage: page,
	}) => {
		await omitPaymentLinkFromPushAcks(page);
		await addTestProductToCart(page);

		const gatewaysLoaded = gatewaysResponse(page);
		await openCheckout(page);
		await gatewaysLoaded;
		await expect(page.getByTestId('process-payment-button')).toBeDisabled({
			timeout: 15_000,
		});
	});

	test('should auto print receipt after checkout when enabled', async ({ posPage: page }) => {
		await enableAutoReceiptSettings(page);
		await page.reload();
		await expect(page.getByTestId('search-products')).toBeVisible({
			timeout: 30_000,
		});

		await addTestProductToCart(page);

		await openCheckout(page);
		const orderIdMatch = page.url().match(/\/cart\/([^/]+)\/checkout$/);
		expect(orderIdMatch?.[1]).toBeTruthy();

		await page.goto(`/cart/receipt/${orderIdMatch![1]}`);
		const printButton = page.getByTestId('receipt-print-button');
		await expect(printButton).toBeVisible({ timeout: 30_000 });
		await expect(printButton).toBeDisabled({ timeout: 10_000 });
	});
});

/**
 * REAL payment completion, end to end, against the live store.
 *
 * Everything else in this file stops at the modal or stubs the ack. Commit
 * 7a556ce86 deleted the only test that actually took payment, so since then no
 * CI signal has covered "money moved and the server agrees with the cart" —
 * exactly the class of bug that matters most in a POS.
 *
 * This spec WRITES to the shared live store, so it follows the labelling and
 * cleanup contract in order-lifecycle.ts. It deliberately uses a single simple
 * product and NO coupons: coupon recalculation behaviour differs across #1020,
 * and this spec must not encode either side of that.
 */
liveTest.describe('POS Checkout - real payment (live store)', () => {
	liveTest(
		'completes payment and the server order matches what the cart sent',
		async ({ posPage: page, storeAuthorization, trackOrder, request }, testInfo) => {
			// A real payment is two live round-trips plus the store's own order-pay page.
			liveTest.slow();

			const label = newRunLabel();

			await addTestProductToCart(page);
			await stampRunLabel(page, label);

			// The till's own money, captured while the CART is still on screen — the
			// checkout modal replaces it, and payment clears it. Since #1507 this is
			// the client-side referent for the aggregate: WooCommerce authors `total`
			// from the lines, so the push body no longer carries the POS's figure.
			const cart = await readCartMoney(page);

			const { orderId, sent } = await openCheckout(page, {
				onOrderCreated: (order) => trackOrder({ ...order, label }),
			});

			// The amount put in front of the cashier, captured before paying.
			const amountShown = digitsOf(
				(await page.getByTestId('checkout-amount-to-pay').textContent()) ?? ''
			);
			expect(Number(amountShown), 'checkout must show a non-zero amount').toBeGreaterThan(0);

			await processPayment(page);

			// Resolved once against the read-back namespace. `storeAuthorization()` is the
			// last credential the app was seen SENDING — a restored session replays an
			// expired token, and the read-back then fails with HTTP 401 as though the
			// order were missing.
			const probeAuthorization = await resolveProbeAuthorization(
				request,
				getStoreUrl(testInfo),
				storeAuthorization,
				{ route: '/wcpos/v2/orders' }
			);
			const server = await readOrder(request, testInfo, probeAuthorization, orderId);

			// IDENTITY FIRST. Everything below is only meaningful if this is the order
			// this test created — the store is shared, so a readback that silently
			// landed on someone else's order must fail here, loudly.
			expect(server.customer_note, 'readback must be the order this test created').toBe(label);
			expect(Number(server.id ?? server.order_id)).toBe(orderId);

			// PAYMENT ACTUALLY HAPPENED.
			expectOrderPaid(server);

			// THE CART SURVIVED THE ROUND TRIP.
			const sentItems: OrderLineItem[] = sent.line_items ?? [];
			const serverItems: OrderLineItem[] = server.line_items ?? [];
			expect(sentItems.length, 'test must have sent at least one line item').toBeGreaterThan(0);
			expect(serverItems).toHaveLength(sentItems.length);

			// MONEY, in two parts, because they are two different contracts.
			//
			// (a) AMOUNTS RUNG UP must survive the round trip exactly. `subtotal` and
			//     `total` are what the cashier charged; if those drift, the sale is wrong.
			//
			// (b) TAX PARITY. The server recalculates taxes (server-calc-is-truth), but
			//     on a correctly configured store its answer MUST equal the POS's answer
			//     — both compute the same rates from the same tax location. An earlier
			//     revision of this spec deliberately skipped tax comparison, reading a
			//     measured drift (client subtotal_tax 4.090909 → server 9.163636) as
			//     "dev-next applies a surcharge when the order is paid". That drift WAS
			//     a live bug: the v2 push create dropped `_pos_store` before the
			//     server's tax calculation, so multi-store orders were taxed from the
			//     SITE base address (GB VAT 20% + compound Surcharge 2% = exactly the
			//     ×1.224 "surcharge") — woocommerce-pos#1545. Parity is the invariant;
			//     drift is an alarm, never an environment quirk to code around. Full
			//     stored precision remains asserted per the #946 contract.
			for (const [index, sentItem] of sentItems.entries()) {
				// Match on identity ONLY. There is deliberately no positional fallback:
				// substituting `serverItems[index]` when the (product_id, variation_id)
				// lookup misses would let the test pass whenever an unrelated line
				// happened to share a quantity and price — which is precisely the
				// "the cart's exact items survived" claim this block is making.
				const match = serverItems.find(
					(item) =>
						Number(item.product_id) === Number(sentItem.product_id) &&
						Number(item.variation_id ?? 0) === Number(sentItem.variation_id ?? 0)
				);
				expect(
					match,
					`server has no line item for product ${sentItem.product_id}` +
						`/variation ${sentItem.variation_id ?? 0} (sent as line ${index})`
				).toBeTruthy();
				if (!match) continue;

				expect(Number(match.quantity), `line_items[${index}].quantity`).toBe(
					Number(sentItem.quantity)
				);
				for (const field of ['subtotal', 'total'] as const) {
					if (sentItem[field] === undefined) continue;
					expectMoneyMatches(match[field], sentItem[field], `line_items[${index}].${field}`);
				}
				expect(match.total_tax, `line_items[${index}].total_tax must be present`).toBeDefined();
				expectFullPrecision(match.total_tax!, `line_items[${index}].total_tax`);
				if (match.subtotal_tax !== undefined) {
					expectFullPrecision(match.subtotal_tax, `line_items[${index}].subtotal_tax`);
				}
				// Tax parity per line (see contract (b) above): what the POS computed is
				// what the server computed. Guarded on the client having sent the field —
				// a sparse client payload is not a parity violation. Tax fields use the
				// one-microunit rounding-tie tolerance (see expectTaxParity).
				if (sentItem.total_tax !== undefined) {
					expectTaxParity(
						match.total_tax,
						sentItem.total_tax,
						`line_items[${index}].total_tax parity`
					);
				}
				// Guard only on the CLIENT having sent the field — if the server drops
				// a subtotal_tax the client sent, that is a broken round trip and
				// expectTaxParity's missing-server check must fail it, not a silent
				// skip (#1114 review).
				if (sentItem.subtotal_tax !== undefined) {
					expectTaxParity(
						match.subtotal_tax,
						sentItem.subtotal_tax,
						`line_items[${index}].subtotal_tax parity`
					);
				}
			}

			expect(server.tax_lines, 'tax_lines must be present').toBeDefined();
			expect(
				server.tax_lines!.length,
				'tax_lines must contain the taxable fixture'
			).toBeGreaterThan(0);
			for (const [index, taxLine] of server.tax_lines!.entries()) {
				expectFullPrecision(taxLine.tax_total, `tax_lines[${index}].tax_total`);
			}
			expect(server.cart_tax, 'cart_tax must be present').toBeDefined();
			expectFullPrecision(server.cart_tax!, 'cart_tax');

			// RATE PARITY: the server applied the same tax rates the POS applied —
			// not merely "some taxes at full precision". A location mismatch (the
			// #1545 class: server taxing from site base instead of the POS store)
			// swaps the rate SET even when amounts happen to be close, so compare
			// rate ids, not amounts. Unconditional over BOTH sets (#1114 review): a
			// serialization regression dropping the client's tax_lines on this
			// taxable sale fails as a set mismatch instead of skipping the check.
			// The client's rate set comes from the LINE taxes it pushes, not from
			// `tax_lines`: since #1507 the order's tax lines are readonly aggregate
			// WooCommerce authors, and the POS no longer sends them — reading them off
			// the wire would compare `[]` against the server's real rates.
			expectRateSetParity(
				posAppliedRateIds(sent),
				server.tax_lines,
				'server tax rates must equal the rates the POS applied'
			);
			// `cart_tax` parity is not asserted from the push body any more, for the
			// same reason — and it needs no replacement here: cart_tax is the sum of
			// the per-line taxes, every one of which is compared above against the
			// client's own figure, and the server derives its cart_tax from those same
			// lines. A per-line drift fails there, named by line, rather than as one
			// opaque aggregate difference.

			// THE MONEY THE CASHIER WAS ASKED FOR IS THE MONEY THE SERVER RECORDED —
			// and both equal what the cart rang up. An earlier revision only compared
			// server.total against the checkout modal, excusing the cart mismatch as
			// "dev-next adds its surcharge when the order is PAID" (45.00 → 50.07).
			// That 50.07 was the #1545 tax-location bug to the exact cent: net 40.909
			// × 1.224 (GB VAT 20% + compound 2%). On a correctly configured store all
			// three numbers are ONE number; any tolerated divergence must be a named,
			// narrowly-scoped exception here, never a blanket "the server may differ".
			expect(digitsOf(Number(server.total).toFixed(2)), 'amount charged vs amount shown').toBe(
				amountShown
			);
			// The cart's OWN arithmetic against the server's, read from the till
			// rather than from the push body: since #1507 the POS does not send the
			// aggregate (WooCommerce authors it from the lines), so `sent.total` is
			// absent and a comparison guarded on it would never run. `amountShown`
			// above is the checkout modal's rendering of this same number; `cart.total`
			// is the cart's persisted figure at full stored precision.
			expectMoneyMatches(server.total, cart.total, 'order total parity (cart vs server)');
		}
	);

	/**
	 * On woocommerce-pos#946 (the `dp` pin).
	 *
	 * This spec was expected to need a tolerance here: the concern was that the v2
	 * routes serialise money at DISPLAY decimals regardless of `dp`, which would
	 * make a 6dp assertion red on day one for a server-side gap.
	 *
	 * Measured live against dev-next on 2026-08-06, that is NOT what
	 * `GET /wcpos/v2/orders?...&dp=6` does — it returns `45.000000`, `4.090909`,
	 * `9.163636`. The route honours `dp` today. So the precision contract is
	 * asserted for real (see `expectFullPrecision`) instead of parked behind a
	 * `test.fixme` that nobody would ever come back to. If a plugin change starts
	 * rounding to display decimals, these assertions go red — which is the point.
	 */
});

test('uses the legacy webview for built-in POS gateways even when supports_checkout=true', async ({
	posPage: page,
}) => {
	let contractCheckoutRequested = false;
	await page.route(isGatewayBootstrapUrl, async (route) => {
		contractCheckoutRequested = true;
		await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
	});
	await page.route(isOrderCheckoutUrl, async (route) => {
		contractCheckoutRequested = true;
		await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
	});
	await page.route(isPaymentGatewaysUrl, async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify([
				{
					id: 'pos_cash',
					provider: 'wcpos',
					pos_type: 'manual',
					capabilities: { supports_checkout: true },
				},
			]),
		});
	});

	await omitPaymentLinkFromPushAcks(page);
	await addTestProductToCart(page);
	const gatewaysLoaded = gatewaysResponse(page);
	await openCheckout(page);
	await gatewaysLoaded;
	await expect(page.getByTestId('process-payment-button')).toBeDisabled({ timeout: 10_000 });
	expect(contractCheckoutRequested).toBe(false);
});

test('falls back to the legacy webview when supports_checkout=false', async ({ posPage: page }) => {
	await page.route(isPaymentGatewaysUrl, async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(
				[
					'bacs',
					'pos_cash',
					'wcpos_cash',
					'stripe',
					'woocommerce_payments',
					'stripe_terminal_for_woocommerce',
				].map((id) => ({
					id,
					provider: 'woocommerce',
					pos_type: id.includes('cash') || id === 'bacs' ? 'manual' : 'terminal',
					capabilities: { supports_checkout: false },
				}))
			),
		});
	});

	await omitPaymentLinkFromPushAcks(page);
	await addTestProductToCart(page);
	const gatewaysLoaded = gatewaysResponse(page);
	await openCheckout(page);
	await gatewaysLoaded;
	await expect(page.getByTestId('process-payment-button')).toBeDisabled({
		timeout: 10_000,
	});
});
