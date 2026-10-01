import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

import {
	addCheckoutProbeProduct,
	checkoutProbeAddControl,
	isolatedProductTest as test,
} from './checkout-probe';
import { ensureGridView } from './pos-view-mode';

/**
 * #2370: a burst of adds shows ONE added-to-cart toast that updates in place, and no toast takes a
 * tap meant for the product grid. On the iPad a stack of these toasts covered the top product row
 * and the cart reached 7 of 20 adds.
 */

/** The add control the setup add used: the run-private probe, else the first tile it filtered to. */
function burstControl(page: Page): Locator {
	const posScreen = page.getByTestId('screen-pos').filter({ visible: true });
	return (
		checkoutProbeAddControl(page) ??
		posScreen.getByTestId('product-tile').or(posScreen.getByTestId('add-to-cart-button')).first()
	);
}

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
	// Add 1 of 5; the four taps below land while its toast is still open.
	await addCheckoutProbeProduct(page);
	const control = burstControl(page);
	await expect(control).toBeVisible();

	for (let index = 0; index < 4; index += 1) {
		const hit = await hitTarget(control);
		expect(hit, `tap ${index + 2} of 5 lands on the product, not on ${hit.coveredBy}`).toEqual(
			expect.objectContaining({ landsOnControl: true })
		);
		await control.click();
		await page.waitForTimeout(200);
	}

	// One product, one cart line, five adds: no tap went to another product or to a toast.
	await expect(page.getByTestId('cart-quantity-input')).toHaveCount(1);
	await expect(page.getByTestId('cart-quantity-input').first()).toHaveText('5', {
		timeout: 15_000,
	});
	await capture(page, testInfo, 'toast-burst-after-5-adds');
	await expect(page.getByTestId('success-toast')).toHaveCount(1);
});
