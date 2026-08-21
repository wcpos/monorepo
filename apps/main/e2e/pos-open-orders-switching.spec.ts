import { expect, type Page } from '@playwright/test';

import { addCheckoutProbeProduct, isolatedProductTest as test } from './checkout-probe';

/**
 * Multi-tab open-orders switching (ADR 0028 stage I2, #1385).
 *
 * The cart lane reads the current order through the context's RECORD face; switching tabs
 * swaps the record without a remount (`setCurrentOrderID`), and every cart read —
 * `useRecordField` subscriptions, `getLatest()` sync reads, the write handoffs keyed on
 * the record captured at press time — must follow the swap. This spec exercises the full
 * loop live: two orders born through the POS UI, tab switches both ways, an edit landed
 * after a round-trip switch.
 *
 * Store-agnostic: the open-orders strip is shared cashier state, and concurrent CI shards
 * sync THEIR pos-open orders into this client too — so this spec never asserts tab
 * counts. Each order this test creates is identified at birth via the ACTIVE tab (the
 * birth selects the new order locally; active state is this client's own), and every
 * later assertion targets those two captured uuid-bearing testIDs. Cart-row assertions
 * are scoped to the selected order, which is always one of ours. The
 * isolatedProductTest fixture's teardown finalizes this run's pos-open orders.
 */

/** Rows currently rendered in the cart table (one quantity input per line-item row). */
function cartRows(page: Page) {
	return page.getByTestId('cart-quantity-input');
}

/** The digits of the first cart row's quantity (tolerates locale formatting). */
async function firstRowQuantityDigits(page: Page): Promise<string> {
	const text = (await cartRows(page).first().textContent()) ?? '';
	return text.replace(/\D/g, '');
}

/**
 * The uuid-bearing testID of the currently ACTIVE order tab — used right after a birth,
 * when the newly born order is the selected one. `expect.poll` because birth
 * (temp-template swap -> resident -> tab materialization -> selection) is async.
 */
async function activeOrderTabId(page: Page, notId?: string): Promise<string> {
	const active = page.locator('[data-testid^="open-order-tab-"][data-state="active"]');
	await expect
		.poll(
			async () => {
				const id = await active.first().getAttribute('data-testid');
				return id && id !== notId ? id : null;
			},
			{ timeout: 15_000 }
		)
		.not.toBeNull();
	const id = await active.first().getAttribute('data-testid');
	expect(id).toBeTruthy();
	return id!;
}

test.describe('POS open-orders tab switching', () => {
	test('cart contents follow the selected order tab across switches', async ({ posPage: page }) => {
		// Order 1 is born from the first add (temporary template -> engine resident) and
		// becomes the selected order; capture ITS tab id — never a count.
		await addCheckoutProbeProduct(page);
		await expect(cartRows(page)).toHaveCount(1, { timeout: 15_000 });
		const order1TabId = await activeOrderTabId(page);

		// Switch to the NEW order tab: the cart must present the empty template.
		await page.getByTestId('new-order-tab').click();
		await expect(cartRows(page)).toHaveCount(0, { timeout: 15_000 });

		// Order 2 is born the same way; its tab becomes active.
		await addCheckoutProbeProduct(page);
		await expect(cartRows(page)).toHaveCount(1, { timeout: 15_000 });
		const order2TabId = await activeOrderTabId(page, order1TabId);
		expect(order2TabId).not.toBe(order1TabId);

		// Back to order 1, then give it a distinctive quantity: the numpad APPENDS to the
		// default 1, so typing "2" yields 12 — a value order 2 cannot have.
		await page.getByTestId(order1TabId).click();
		await expect(cartRows(page)).toHaveCount(1, { timeout: 15_000 });
		await cartRows(page).first().click();
		const numpad = page.locator('[data-radix-popper-content-wrapper]').first();
		await expect(numpad).toBeVisible({ timeout: 15_000 });
		const numpadInput = numpad.locator('input');
		await expect(numpadInput).toBeVisible({ timeout: 10_000 });
		await numpadInput.click();
		await numpadInput.type('2', { delay: 100 });
		await page.getByTestId('numpad-done-button').click();
		await expect.poll(() => firstRowQuantityDigits(page), { timeout: 15_000 }).toMatch(/^12$/);

		// Switch to order 2: its cart is untouched by the edit (quantity still 1).
		await page.getByTestId(order2TabId).click();
		await expect(cartRows(page)).toHaveCount(1, { timeout: 15_000 });
		await expect.poll(() => firstRowQuantityDigits(page), { timeout: 15_000 }).toMatch(/^1$/);

		// And back: order 1 kept the edit across the round trip.
		await page.getByTestId(order1TabId).click();
		await expect(cartRows(page)).toHaveCount(1, { timeout: 15_000 });
		await expect.poll(() => firstRowQuantityDigits(page), { timeout: 15_000 }).toMatch(/^12$/);
	});
});
