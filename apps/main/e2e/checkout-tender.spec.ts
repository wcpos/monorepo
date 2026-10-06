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
import { expect, type Locator, type Page } from '@playwright/test';

import { log } from '@wcpos/utils/logger';

import { addCheckoutProbeProductAgain, checkoutProbeAddControl } from './checkout-probe';
import {
	clickAndExpectPaymentWrite,
	type Descriptor,
	digitsOf,
	ledgerRows,
	newOrderAtCheckout,
	openCheckout,
	pollOrder,
	readAmountMinor,
	requireTenderCheckout,
} from './checkout-shared';
import { ensureRegisterOpen, getStoreVariant } from './fixtures';
import {
	expectOrderPaid,
	liveOrderTest as liveTest,
	newRunLabel,
	readCartMoney,
	readOrder,
	stampRunLabel,
	type TrackedOrder,
} from './order-lifecycle';
import { searchAndWaitForServer, type SearchProbe } from './search-probe';

/**
 * A ledger leg row, `checkout-leg-<id>`. Its timeline dot (`checkout-leg-dot-<id>`) and tip
 * line (`checkout-leg-tip-<id>`) share the prefix, so a bare prefix counts one leg as two.
 */
const LEG_ROW = /^checkout-leg-(?!dot-|tip-)/;

/** Methods the tender grid can actually drive: enabled, and captured by the app itself. */
function manualMethods(descriptors: Descriptor[]): Descriptor[] {
	return descriptors.filter((method) => method.pos_enabled && method.capture?.mode === 'manual');
}

/** Tap a tile, then key in an exact minor-unit amount (digits shift in from the right). */
async function enterAmount(page: Page, methodId: string, amountMinor: number): Promise<void> {
	await page.getByTestId(`checkout-method-${methodId}`).click();
	await expect(page.getByTestId('checkout-keypad')).toBeVisible({ timeout: 15_000 });
	await page.getByTestId('checkout-key-clear').click();
	for (const digit of String(amountMinor)) {
		await page.getByTestId(`checkout-key-${digit}`).click();
	}
	await expect
		.poll(() => readAmountMinor(page, 'checkout-entry'), { timeout: 10_000 })
		.toBe(amountMinor);
}

async function isSwitchOn(toggle: Locator): Promise<boolean> {
	return toggle.evaluate((node) => {
		const element = node as HTMLElement & { checked?: boolean };
		const ariaChecked = element.getAttribute('aria-checked');
		if (ariaChecked !== null) return ariaChecked === 'true';
		const dataState = element.getAttribute('data-state');
		if (dataState !== null) return dataState === 'checked';
		return element.checked === true;
	});
}

/**
 * Set the cart's auto-print setting from the UI itself (never storage internals), with the
 * cart on screen. Reactive: the receipt stage reads the setting live, so no reload is needed.
 */
async function setAutoPrintReceipt(page: Page, on: boolean): Promise<void> {
	// Bounded: the config sets no actionTimeout, and this also runs from a `finally`.
	await page
		.getByTestId('cart-settings-button')
		.filter({ visible: true })
		.click({ timeout: 15_000 });
	const toggle = page.getByTestId('cart-setting-auto-print-receipt').first();
	await expect(toggle).toBeVisible({ timeout: 15_000 });
	if ((await isSwitchOn(toggle)) !== on) await toggle.click();
	await expect.poll(() => isSwitchOn(toggle), { timeout: 10_000 }).toBe(on);
	await page.keyboard.press('Escape');
	await expect(toggle).toBeHidden({ timeout: 10_000 });
}

/** On a phone the cart and the products grid are separate tabs; only the shown one is visible. */
async function showPhoneTab(page: Page, tab: 'products' | 'cart'): Promise<void> {
	await page.getByTestId(`pos-tab-${tab}`).filter({ visible: true }).click();
}

/**
 * `newOrderAtCheckout` at phone width: the same run-private probe, run label and checkout,
 * with the register card and cart on the Cart tab and the search on the Products tab.
 */
async function newPhoneOrderAtCheckout(
	page: Page,
	trackOrder: (order: TrackedOrder) => void,
	probe: SearchProbe | null
): Promise<{ orderId: number; uuid: string; mode: 'tender' | 'legacy' }> {
	liveTest.skip(!probe, 'product-writer credentials are unavailable');
	await showPhoneTab(page, 'cart');
	await ensureRegisterOpen(page);
	await showPhoneTab(page, 'products');
	await searchAndWaitForServer(page, page.getByTestId('search-products'), 'products', probe!.token);
	const add = checkoutProbeAddControl(page);
	expect(add, 'the run-private probe must carry its row testID').not.toBeNull();
	await add!.click({ timeout: 30_000 });
	await showPhoneTab(page, 'cart');
	await expect(page.getByTestId('checkout-button')).toBeVisible({ timeout: 15_000 });
	const label = newRunLabel();
	await stampRunLabel(page, label);
	await readCartMoney(page);
	return openCheckout(page, (order) => trackOrder({ ...order, label }));
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
			await page.getByTestId(`checkout-method-${cash!.id}`).click();
			// The keypad opens pre-filled with the balance — the cashier confirms, never retypes.
			await expect
				.poll(() => readAmountMinor(page, 'checkout-entry'), { timeout: 15_000 })
				.toBe(balance);

			await clickAndExpectPaymentWrite(page, 'checkout-commit', orderId, 'record');

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
		'auto-prints the receipt on the receipt stage when the setting is on',
		async ({ posPage: page, trackOrder, storeAuthorization, request }, testInfo) => {
			liveTest.slow();
			// The receipt stage is the one surface that auto-prints (f61fdc7f6): the standalone
			// receipt modal never does. The setting is reactive and persisted, so it is set with
			// the cart on screen before the order exists, and put back at the end. The till needs
			// an active receipt template (dev-next Pro has one): without it no frame loads and no
			// print is attempted, which reads as a bare timeout below, not a skip.
			await ensureRegisterOpen(page);
			await setAutoPrintReceipt(page, true);
			try {
				const { orderId, mode } = await newOrderAtCheckout(page, trackOrder);
				const { descriptors } = await requireTenderCheckout(
					request,
					testInfo,
					storeAuthorization,
					mode
				);
				const cash = manualMethods(descriptors).find((method) => method.kind === 'cash');
				liveTest.skip(!cash, 'store declares no manual cash method');

				const balance = await readAmountMinor(page, 'checkout-balance');
				await page.getByTestId(`checkout-method-${cash!.id}`).click();
				await expect
					.poll(() => readAmountMinor(page, 'checkout-entry'), { timeout: 15_000 })
					.toBe(balance);
				await clickAndExpectPaymentWrite(page, 'checkout-commit', orderId, 'record');

				await expect(page.getByTestId('checkout-receipt-stage')).toBeVisible({
					timeout: 120_000,
				});
				// `receipt-printed-to` renders only once a print was dispatched (`printedTo` is set
				// on a `true` return): the auto-print fired, through the system print on web. That
				// waits for the receipt frame to load, a live fetch of the receipt for printing (the
				// http client's 30 s timeout on a store that stalls), and then for `afterprint`,
				// which headless Chromium may never fire — the adapter settles on its 60 s fallback.
				// The window covers the sum of those, as the stage waits above do, not a UI delay.
				await expect(page.getByTestId('receipt-printed-to')).toBeVisible({
					timeout: 120_000,
				});
				// New sale is held only until the auto-print is ATTEMPTED (`autoPrintPending`), so by
				// now it is live; the click below is the test's way back to the cart.
				await expect(page.getByTestId('receipt-new-sale')).toBeEnabled();
				await page.getByTestId('receipt-new-sale').click();
				await expect(page.getByTestId('checkout-tender-pane')).toBeHidden({ timeout: 30_000 });
			} finally {
				await setAutoPrintReceipt(page, false).catch(() => undefined);
			}
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
			await clickAndExpectPaymentWrite(page, 'checkout-commit', orderId, 'record');

			// The balance falls by exactly what was taken, and the ledger shows the one leg.
			await expect
				.poll(() => readAmountMinor(page, 'checkout-balance'), { timeout: 60_000 })
				.toBe(balance - part);
			await expect(page.getByTestId(LEG_ROW)).toHaveCount(1);

			await page.getByTestId(`checkout-method-${second!.id}`).click();
			// Pre-filled with the REMAINING balance, so the second leg closes the order.
			await expect
				.poll(() => readAmountMinor(page, 'checkout-entry'), { timeout: 15_000 })
				.toBe(balance - part);
			await clickAndExpectPaymentWrite(page, 'checkout-commit', orderId, 'record');

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
		'refuses an over-tender on a method that cannot give change',
		async ({ posPage: page, trackOrder, storeAuthorization, request }, testInfo) => {
			liveTest.slow();
			const { mode } = await newOrderAtCheckout(page, trackOrder);
			const { descriptors } = await requireTenderCheckout(
				request,
				testInfo,
				storeAuthorization,
				mode
			);
			const method = manualMethods(descriptors).find(
				(candidate) => candidate.kind !== 'cash' && candidate.capabilities?.change !== true
			);
			liveTest.skip(!method, 'store declares no manual non-cash method that cannot give change');

			const balance = await readAmountMinor(page, 'checkout-balance');
			await enterAmount(page, method!.id, balance + 100);
			await expect(page.getByTestId('checkout-commit')).toBeDisabled();
			await expect(page.getByTestId('checkout-entry-hint')).toBeVisible();
			await page.getByTestId('checkout-quick-balance').click();
			await expect(page.getByTestId('checkout-commit')).toBeEnabled();
		}
	);

	liveTest(
		'splits evenly through the split view and records two legs',
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
			liveTest.skip(balance < 2, 'order balance is too small for two positive payment legs');

			await page.getByTestId('checkout-split-chip').click();
			await expect(page.getByTestId('checkout-split-tab-even')).toBeVisible();
			await page.getByTestId('checkout-split-option-2').click();
			await expect(page.getByTestId('checkout-plan')).toBeVisible();
			const legs = page.getByTestId(/^checkout-plan-leg-\d+$/);
			await expect(legs).toHaveCount(2);
			const first = await readAmountMinor(page, 'checkout-entry');
			expect(first).toBeGreaterThan(0);
			expect(first).toBeLessThan(balance);
			// Before any payment, these pills contain only formatted amounts, not method titles.
			const plannedFirst = await readAmountMinor(page, 'checkout-plan-leg-0');
			const plannedSecond = await readAmountMinor(page, 'checkout-plan-leg-1');
			expect(first).toBe(plannedFirst);
			expect(plannedFirst + plannedSecond).toBe(balance);

			await page.getByTestId(`checkout-method-${cash!.id}`).click();
			await clickAndExpectPaymentWrite(page, 'checkout-commit', orderId, 'record');
			await expect(page.getByTestId('checkout-label')).toBeVisible();
			// Done pills have no state attribute; the view marks them with this success class.
			await expect(page.getByTestId('checkout-plan-leg-0')).toHaveClass(/\bbg-success\/20\b/, {
				timeout: 60_000,
			});
			await expect(legs).toHaveCount(2);
			await expect(page.getByTestId('checkout-plan-leg-1')).not.toHaveClass(/\bbg-success\/20\b/);
			await expect
				.poll(() => readAmountMinor(page, 'checkout-entry'), { timeout: 15_000 })
				.toBe(plannedSecond);
			await page.getByTestId(`checkout-method-${cash!.id}`).click();
			await clickAndExpectPaymentWrite(page, 'checkout-commit', orderId, 'record');
			await expect(page.getByTestId('checkout-paid')).toBeVisible({ timeout: 120_000 });
			await expect(page.getByTestId('checkout-paid-headline')).toBeVisible();
			await page.getByTestId('receipt-new-sale').click();

			const server = await pollOrder(
				request,
				testInfo,
				authorization,
				orderId,
				(order) => ledgerRows(order).length === 2,
				'the server must record both even split legs'
			);
			expectOrderPaid(server);
			const rows = ledgerRows(server);
			expect(rows.map((row) => row.status)).toEqual(['captured', 'captured']);
			expect(rows.map((row) => row.method_id)).toEqual([cash!.id, cash!.id]);
			expect(rows.reduce((sum, row) => sum + Number(row.amount), 0)).toBeCloseTo(
				Number(server.total),
				2
			);
		}
	);

	liveTest(
		'shares a ticked line between two payments',
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
			liveTest.skip(balance < 2, 'order balance is too small for two positive payment legs');
			await page.getByTestId('checkout-split-chip').click();
			await page.getByTestId('checkout-split-tab-item').click();
			const items = page.getByTestId(/^checkout-split-item-/);
			liveTest.skip((await items.count()) === 0, 'checkout declares no splittable item rows');
			await items.first().click();
			await page.getByTestId('checkout-split-share-2').click();
			await expect(page.getByTestId('checkout-plan')).toBeVisible();
			// Item plans use line.total, excluding tax: a taxed order (or one with fees or
			// shipping) carries a third "then X" leg for the rest of the balance.
			const legs = page.getByTestId(/^checkout-plan-leg-\d+$/);
			const legCount = await legs.count();
			expect([2, 3]).toContain(legCount);
			const plannedFirst = await readAmountMinor(page, 'checkout-plan-leg-0');
			const plannedSecond = await readAmountMinor(page, 'checkout-plan-leg-1');
			const group = plannedFirst + plannedSecond;
			expect(plannedFirst).toBeGreaterThan(0);
			expect(group).toBeLessThanOrEqual(balance);
			expect(legCount).toBe(group === balance ? 2 : 3);
			await expect.poll(() => readAmountMinor(page, 'checkout-entry')).toBe(plannedFirst);
			await page.getByTestId(`checkout-method-${cash!.id}`).click();
			await clickAndExpectPaymentWrite(page, 'checkout-commit', orderId, 'record');
			await expect(page.getByTestId('checkout-plan-leg-0')).toHaveClass(/\bbg-success\/20\b/, {
				timeout: 60_000,
			});
			await expect
				.poll(() => readAmountMinor(page, 'checkout-entry'), { timeout: 15_000 })
				.toBe(plannedSecond);
			await page.getByTestId(`checkout-method-${cash!.id}`).click();
			await clickAndExpectPaymentWrite(page, 'checkout-commit', orderId, 'record');
			if (legCount === 3) {
				// The group is paid; the rest of the order is the current leg.
				await expect
					.poll(() => readAmountMinor(page, 'checkout-entry'), { timeout: 60_000 })
					.toBe(balance - group);
				await page.getByTestId(`checkout-method-${cash!.id}`).click();
				await clickAndExpectPaymentWrite(page, 'checkout-commit', orderId, 'record');
			}
			await expect(page.getByTestId('checkout-paid')).toBeVisible({ timeout: 120_000 });
			await page.getByTestId('receipt-new-sale').click();

			const server = await pollOrder(
				request,
				testInfo,
				authorization,
				orderId,
				(order) => ledgerRows(order).length === legCount,
				'the server must record every leg of the item split'
			);
			expectOrderPaid(server);
			const rows = ledgerRows(server);
			expect(rows.every((row) => row.status === 'captured')).toBe(true);
			expect(rows.reduce((sum, row) => sum + Number(row.amount), 0)).toBeCloseTo(
				Number(server.total),
				2
			);
		}
	);

	liveTest(
		'shows the Paid moment for a cash sale with change',
		async ({ posPage: page, trackOrder, storeAuthorization, request }, testInfo) => {
			liveTest.slow();
			const { orderId, mode } = await newOrderAtCheckout(page, trackOrder);
			const { descriptors } = await requireTenderCheckout(
				request,
				testInfo,
				storeAuthorization,
				mode
			);
			const cash = manualMethods(descriptors).find(
				(method) => method.kind === 'cash' && method.capabilities?.change === true
			);
			liveTest.skip(!cash, 'store declares no manual cash method that gives change');
			const balance = await readAmountMinor(page, 'checkout-balance');
			await enterAmount(page, cash!.id, balance + 500);
			await expect(page.getByTestId('checkout-entry-hint')).toBeVisible();
			// This hint's only value is the change amount, independent of translated wording.
			expect(await readAmountMinor(page, 'checkout-entry-hint')).toBe(500);
			await clickAndExpectPaymentWrite(page, 'checkout-commit', orderId, 'record');
			await expect(page.getByTestId('checkout-paid')).toBeVisible({ timeout: 120_000 });
			await expect(page.getByTestId('receipt-change-due')).toBeVisible();
			await page.getByTestId('receipt-no-receipt').click();
		}
	);

	liveTest(
		'shows the offline badge when the till loses the store',
		async ({ posPage: page, trackOrder, storeAuthorization, request }, testInfo) => {
			liveTest.slow();
			const { mode } = await newOrderAtCheckout(page, trackOrder);
			await requireTenderCheckout(request, testInfo, storeAuthorization, mode);
			// use-online-status.web.tsx handles the browser's offline event immediately.
			try {
				await page.context().setOffline(true);
				await expect(page.getByTestId('checkout-offline')).toBeVisible({ timeout: 15_000 });
			} finally {
				await page.context().setOffline(false);
			}
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
			await clickAndExpectPaymentWrite(page, 'checkout-commit', orderA.orderId, 'record');
			const ledgerRow = page.getByTestId('checkout-ledger').getByTestId(LEG_ROW);
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
			await clickAndExpectPaymentWrite(page, 'checkout-commit', orderB.orderId, 'record');
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
			await clickAndExpectPaymentWrite(page, 'checkout-commit', orderA.orderId, 'record');
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
			await clickAndExpectPaymentWrite(page, 'checkout-commit', orderId, 'record');
			await expect
				.poll(() => readAmountMinor(page, 'checkout-balance'), { timeout: 60_000 })
				.toBe(balance - part);
			const ledgerRow = page.getByTestId(LEG_ROW);
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

	liveTest.describe('on a phone', () => {
		liveTest.use({ viewport: { width: 390, height: 844 } });

		// New sale must land on Products with its register bar and keep that tab across the drawer.
		liveTest(
			'lands on the phone Products tab after New sale and keeps it across a drawer round trip (#2363)',
			async (
				{ posPage: page, trackOrder, storeAuthorization, request, runPrivateSimpleProducts },
				testInfo
			) => {
				liveTest.slow();
				const drawerButton = page
					.getByTestId('pos-products-tab')
					.filter({ visible: true })
					.getByTestId('pos-drawer-open-button');
				await expect(
					drawerButton,
					'the phone Products tab starts with its register bar'
				).toBeVisible({ timeout: 30_000 });

				const { orderId, mode } = await newPhoneOrderAtCheckout(
					page,
					trackOrder,
					runPrivateSimpleProducts?.[0] ?? null
				);
				const { descriptors } = await requireTenderCheckout(
					request,
					testInfo,
					storeAuthorization,
					mode
				);
				const cash = manualMethods(descriptors).find((method) => method.kind === 'cash');
				liveTest.skip(!cash, 'store declares no manual cash method');

				const balance = await readAmountMinor(page, 'checkout-balance');
				await page.getByTestId(`checkout-method-${cash!.id}`).click();
				await expect
					.poll(() => readAmountMinor(page, 'checkout-entry'), { timeout: 15_000 })
					.toBe(balance);
				await clickAndExpectPaymentWrite(page, 'checkout-commit', orderId, 'record');
				await expect(page.getByTestId('checkout-receipt-stage')).toBeVisible({ timeout: 120_000 });
				await page.getByTestId('receipt-new-sale').click();
				await expect(page.getByTestId('checkout-receipt-stage')).toBeHidden({ timeout: 30_000 });

				await expect(
					page.getByTestId('search-products').filter({ visible: true }),
					'#2363: New sale must land on the phone Products tab'
				).toBeVisible({ timeout: 30_000 });
				await expect(
					drawerButton,
					'#2363: after New sale the phone Products tab must keep its register bar drawer button'
				).toBeVisible({ timeout: 30_000 });
				await drawerButton.click();
				await expect(page.getByTestId('drawer-item-pos')).toBeVisible({ timeout: 15_000 });
				await page.getByTestId('drawer-item-orders').click();
				await expect(page.getByTestId('screen-orders')).toBeVisible({ timeout: 60_000 });
				await page.getByTestId('orders-bar-menu').filter({ visible: true }).click();
				await expect(page.getByTestId('drawer-item-pos')).toBeInViewport({ timeout: 15_000 });
				await page.getByTestId('drawer-item-pos').click();
				// On web the closed drawer stays in the DOM off-screen, so check the viewport.
				await expect(page.getByTestId('drawer-item-pos')).not.toBeInViewport({ timeout: 15_000 });
				await expect(
					page.getByTestId('search-products').filter({ visible: true }),
					'#2363: returning to POS through the drawer must keep the Products tab'
				).toBeVisible({ timeout: 60_000 });
			}
		);
	});
});
