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
import { expect, type Page } from '@playwright/test';

import { log } from '@wcpos/utils/logger';

import { addCheckoutProbeProductAgain } from './checkout-probe';
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
import { getStoreVariant } from './fixtures';
import {
	expectOrderPaid,
	liveOrderTest as liveTest,
	newRunLabel,
	readCartMoney,
	readOrder,
	stampRunLabel,
} from './order-lifecycle';

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
			await expect(page.locator('[data-testid^="checkout-leg-"]')).toHaveCount(1);

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
