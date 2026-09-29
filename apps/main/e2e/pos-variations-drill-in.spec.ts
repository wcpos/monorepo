import { expect } from '@playwright/test';

import { findVariableProduct, isolatedVariableProductTest as test } from './checkout-probe';
import { ensureRegisterOpen, setVariationsStyle } from './fixtures';
import { ensureTableView } from './pos-view-mode';

test('drills into variations, adds a line and returns to products', async ({ posPage: page }) => {
	await ensureRegisterOpen(page);
	await setVariationsStyle(page, 'drill');
	try {
		await ensureTableView(page);
		await findVariableProduct(page, page.getByTestId('screen-pos').getByTestId('search-products'));
		// The drill chevron beside a variable row is the row's named control; it drills in.
		const variable = page.getByTestId('variable-product-drill').first();
		await expect(variable).toBeVisible({ timeout: 30_000 });
		await page.getByTestId('new-order-tab').click();
		const lines = page.getByTestId('cart-line-total');
		const before = await lines.count();
		await variable.click();
		await expect(page.getByTestId('products-breadcrumb')).toBeVisible();
		const pane = page.getByTestId('products-variations-pane');
		await expect(pane).toBeVisible();
		const variation = pane.getByTestId(/^data-table-row-variation-/).first();
		await expect(variation).toBeVisible({ timeout: 30_000 });
		await variation.click();
		await expect.poll(() => lines.count(), { timeout: 15_000 }).toBeGreaterThan(before);
		await page.getByTestId('products-breadcrumb-back').click();
		await expect(pane).toBeHidden();
	} finally {
		await setVariationsStyle(page, 'inline');
	}
});
