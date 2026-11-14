import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

import {
	checkoutProbeAddControl,
	isolatedProductTest as test,
	tryAddRunPrivateSimpleProduct,
} from './checkout-probe';
import { ensureRegisterOpen } from './fixtures';
import { ensureGridView } from './pos-view-mode';

/**
 * #2370: a burst of adds shows ONE added-to-cart toast that updates in place, and no toast takes a
 * tap meant for the product grid. On the iPad a stack of these toasts covered the top product row
 * and the cart reached 7 of 20 adds.
 */

const ADDS = 5;

/** What `elementFromPoint` finds at the control's centre: the control itself, or what covers it. */
async function hitTarget(control: Locator) {
	return control.evaluate((element) => {
		const box = element.getBoundingClientRect();
		const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
		return {
			landsOnControl: hit !== null && element.contains(hit),
			coveredBy: hit?.closest('[data-testid]')?.getAttribute('data-testid') ?? hit?.tagName ?? null,
		};
	});
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
	const path = testInfo.outputPath(`${name}.png`);
	await page.screenshot({ path });
	await testInfo.attach(name, { path, contentType: 'image/png' });
}

test('a five-add burst shows one toast and every tap reaches the product', async ({
	posPage: page,
}, testInfo) => {
	await ensureGridView(page);
	await ensureRegisterOpen(page);

	// With writer credentials the burst targets the run-private product, whose first add is the
	// search-and-add below. Without them it targets tile 0 of the grid (`product-tile` is only ever
	// a simple product) from the empty cart: one product either way, or the line count below fails.
	let adds = 0;
	let control: Locator;
	if (await tryAddRunPrivateSimpleProduct(page)) {
		adds = 1;
		control = checkoutProbeAddControl(page)!;
	} else {
		const posScreen = page.getByTestId('screen-pos').filter({ visible: true });
		control = posScreen.getByTestId('product-tile').first();
	}
	await expect(control).toBeVisible({ timeout: 30_000 });

	for (; adds < ADDS; adds += 1) {
		const hit = await hitTarget(control);
		expect(hit, `add ${adds + 1} of ${ADDS} lands on the product, not on ${hit.coveredBy}`).toEqual(
			expect.objectContaining({ landsOnControl: true })
		);
		await control.click();
		await page.waitForTimeout(200);
	}

	await expect(page.getByTestId('cart-quantity-input').first()).toHaveText(String(ADDS), {
		timeout: 15_000,
	});
	await capture(page, testInfo, `toast-burst-after-${ADDS}-adds`);
	// Sampled once, not polled: a stack of toasts expiring one by one would pass through 1.
	expect(await page.getByTestId('success-toast').count(), 'added-to-cart toasts open').toBe(1);
	// One product, one cart line: no tap went to another product.
	await expect(page.getByTestId('cart-quantity-input')).toHaveCount(1);
});
