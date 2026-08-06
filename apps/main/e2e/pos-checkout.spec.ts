import { expect, type Locator, type Page } from '@playwright/test';

import { isRouteTeardownError, authenticatedTest as test } from './fixtures';
import {
	expectFullPrecision,
	expectMoneyMatches,
	expectOrderPaid,
	liveOrderTest as liveTest,
	newRunLabel,
	openCheckout,
	type OrderLineItem,
	processPayment,
	readOrder,
	stampRunLabel,
} from './order-lifecycle';

/**
 * Wait for the payment-gateways fetch the checkout modal fires on mount.
 *
 * Must be created BEFORE the modal opens, so the listener is attached in time.
 * The no-op catch keeps a still-pending wait from surfacing as an unhandled
 * rejection when an earlier step fails the test — an unhandled rejection here
 * takes down the whole worker process (see #997).
 */
function gatewaysResponse(page: Page) {
	const pending = page.waitForResponse('**/wp-json/wcpos/v2/payment-gateways{,?*}', {
		timeout: 90_000,
	});
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

/** Helper to add the first simple product to the cart. Works in both grid and table view. */
async function addFirstProductToCart(page: Page) {
	const tile = page.getByTestId('product-tile').first();
	const tableButton = page.getByTestId('add-to-cart-button').first();
	const productMarker = tile.or(tableButton);

	// Wait for products to render in whichever view mode is active.
	let productsVisible = await productMarker.isVisible({ timeout: 30_000 }).catch(() => false);
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
		productsVisible = await productMarker.isVisible({ timeout: 60_000 }).catch(() => false);
	}
	await expect(productMarker).toBeVisible({
		timeout: productsVisible ? 1_000 : 60_000,
	});

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
	await page.route('**/wp-json/wcpos/v2/push/orders{,?*}', async (route) => {
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
		await addFirstProductToCart(page);

		await page.getByTestId('save-to-server-button').click();

		// Wait for the save button to finish loading (loading state resolves when save completes)
		await expect(page.getByTestId('save-to-server-button')).toBeEnabled({
			timeout: 30_000,
		});
		// Verify a success toast appeared (Sonner toast)
		await expect(page.locator('[data-sonner-toast]').first()).toBeVisible({
			timeout: 10_000,
		});
	});

	test('should add order note', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await page.getByTestId('order-note-button').click();

		const textarea = page.locator('textarea').first();
		await expect(textarea).toBeVisible({ timeout: 15_000 });
		await textarea.fill('Test order note from e2e');

		const addNoteButton = page.getByTestId('add-note-button');
		await expect(addNoteButton).toBeVisible({ timeout: 15_000 });
		await addNoteButton.click();
	});

	test('should open order meta dialog', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

		await page.getByTestId('order-meta-button').click();

		await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });
	});
});

test.describe('POS Cart - Multiple Orders', () => {
	test('should create a new order via tab', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

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
		await addFirstProductToCart(page);

		await openCheckout(page);
	});

	test('should show order total in checkout', async ({ posPage: page }) => {
		await addFirstProductToCart(page);

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
		await addFirstProductToCart(page);

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
		await addFirstProductToCart(page);

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

		await addFirstProductToCart(page);

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

			await addFirstProductToCart(page);
			await stampRunLabel(page, label);

			const { orderId, sent } = await openCheckout(page, {
				onOrderCreated: (order) => trackOrder({ ...order, label }),
			});

			// The amount put in front of the cashier, captured before paying.
			const amountShown = digitsOf(
				(await page.getByTestId('checkout-amount-to-pay').textContent()) ?? ''
			);
			expect(Number(amountShown), 'checkout must show a non-zero amount').toBeGreaterThan(0);

			await processPayment(page);

			const server = await readOrder(request, testInfo, storeAuthorization(), orderId);

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
			// (b) TAX IS RECALCULATED SERVER-SIDE and is deliberately NOT compared to
			//     the client's values. dev-next applies a surcharge when the order is
			//     paid, so the server's tax legitimately differs from what the cart sent
			//     (measured: client subtotal_tax 4.090909 -> server 9.163636). Asserting
			//     equality there would encode "the server may not recalculate", the exact
			//     inverse of the server-calc-is-truth rule. What IS an invariant is that
			//     tax comes back at full stored precision — the #946 contract.
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
				for (const field of ['subtotal_tax', 'total_tax'] as const) {
					if (match[field] === undefined) continue;
					expectFullPrecision(match[field], `line_items[${index}].${field}`);
				}
			}

			for (const [index, taxLine] of (server.tax_lines ?? []).entries()) {
				expectFullPrecision(taxLine.tax_total, `tax_lines[${index}].tax_total`);
			}
			if (server.cart_tax !== undefined) expectFullPrecision(server.cart_tax, 'cart_tax');

			// THE MONEY THE CASHIER WAS ASKED FOR IS THE MONEY THE SERVER RECORDED.
			//
			// This is the assertion that matters most in a POS, and it is NOT
			// `server.total === sent.total`: dev-next adds its surcharge when the
			// order is PAID, so the stored total moves from 45.00 to 50.07 during
			// checkout. Comparing against the pre-payment cart would fail on correct
			// behaviour. Comparing against the amount rendered in the checkout modal
			// — the number the cashier actually collected — is the real invariant,
			// and it catches the nightmare case where the two silently diverge.
			expect(digitsOf(Number(server.total).toFixed(2)), 'amount charged vs amount shown').toBe(
				amountShown
			);
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
	await page.route('**/wp-json/wcpos/v2/payment-gateways/**/bootstrap', async (route) => {
		contractCheckoutRequested = true;
		await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
	});
	await page.route('**/wp-json/wcpos/v2/orders/**/checkout', async (route) => {
		contractCheckoutRequested = true;
		await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
	});
	await page.route('**/wp-json/wcpos/v2/payment-gateways{,?*}', async (route) => {
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
	await addFirstProductToCart(page);
	const gatewaysLoaded = gatewaysResponse(page);
	await openCheckout(page);
	await gatewaysLoaded;
	await expect(page.getByTestId('process-payment-button')).toBeDisabled({ timeout: 10_000 });
	expect(contractCheckoutRequested).toBe(false);
});

test('falls back to the legacy webview when supports_checkout=false', async ({ posPage: page }) => {
	await page.route('**/wp-json/wcpos/v2/payment-gateways{,?*}', async (route) => {
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
	await addFirstProductToCart(page);
	const gatewaysLoaded = gatewaysResponse(page);
	await openCheckout(page);
	await gatewaysLoaded;
	await expect(page.getByTestId('process-payment-button')).toBeDisabled({
		timeout: 10_000,
	});
});
