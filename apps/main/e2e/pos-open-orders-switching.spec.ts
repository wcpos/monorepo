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
 * after a round-trip switch, contents asserted per order via value-bearing testIDs
 * (selector policy: no text selectors; reading a testID-addressed cell's text is fine).
 *
 * Store-agnostic: both orders are created in-run through the UI; assertions are relative
 * (this run's own carts), never fixture contents. The isolatedProductTest fixture's
 * teardown finalizes this run's pos-open orders.
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

test.describe('POS open-orders tab switching', () => {
	test('cart contents follow the selected order tab across switches', async ({ posPage: page }) => {
		// Order 1 is born from the first add (temporary template -> engine resident).
		await addCheckoutProbeProduct(page);
		await expect(cartRows(page)).toHaveCount(1, { timeout: 15_000 });

		// The birth materializes a tab for order 1; capture its uuid-bearing testID.
		const orderTabs = page.locator('[data-testid^="open-order-tab-"]');
		await expect(orderTabs).toHaveCount(1, { timeout: 15_000 });
		const order1TabId = await orderTabs.first().getAttribute('data-testid');
		expect(order1TabId).toBeTruthy();

		// Switch to the NEW order tab: the cart must present the empty template.
		await page.getByTestId('new-order-tab').click();
		await expect(cartRows(page)).toHaveCount(0, { timeout: 15_000 });

		// Order 2 is born the same way; a second tab appears.
		await addCheckoutProbeProduct(page);
		await expect(cartRows(page)).toHaveCount(1, { timeout: 15_000 });
		await expect(orderTabs).toHaveCount(2, { timeout: 15_000 });

		// Back to order 1, then give it a distinctive quantity: the numpad APPENDS to the
		// default 1, so typing "2" yields 12 — a value order 2 cannot have.
		await page.getByTestId(order1TabId!).click();
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
		const order2Tab = page
			.locator('[data-testid^="open-order-tab-"]')
			.and(page.locator(`:not([data-testid="${order1TabId}"])`));
		await order2Tab.first().click();
		await expect(cartRows(page)).toHaveCount(1, { timeout: 15_000 });
		await expect.poll(() => firstRowQuantityDigits(page), { timeout: 15_000 }).toMatch(/^1$/);

		// And back: order 1 kept the edit across the round trip.
		await page.getByTestId(order1TabId!).click();
		await expect(cartRows(page)).toHaveCount(1, { timeout: 15_000 });
		await expect.poll(() => firstRowQuantityDigits(page), { timeout: 15_000 }).toMatch(/^12$/);
	});
});
