import { expect } from '@playwright/test';

import { findVariableProduct, isolatedVariableProductTest as test } from './checkout-probe';
import { ensureRegisterOpen, setVariationsStyle } from './fixtures';
import { ensureGridView, ensureTableView } from './pos-view-mode';

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

test('in the grid, a variable tile deals its variations as tiles and the parent tile goes back', async ({
	posPage: page,
}) => {
	await ensureRegisterOpen(page);
	await setVariationsStyle(page, 'drill');
	try {
		await ensureGridView(page);
		await findVariableProduct(page, page.getByTestId('screen-pos').getByTestId('search-products'));
		const variable = page.getByTestId('variable-product-tile').first();
		await expect(variable).toBeVisible({ timeout: 30_000 });
		await page.getByTestId('new-order-tab').click();
		const lines = page.getByTestId('cart-line-total');
		const before = await lines.count();
		await variable.click();
		const pane = page.getByTestId('products-variations-pane');
		await expect(pane).toBeVisible();
		await expect(page.getByTestId('products-breadcrumb')).toBeVisible();
		// The variations are tiles on the products' grid, not rows.
		const variation = pane.getByTestId('variation-tile').first();
		await expect(variation).toBeVisible({ timeout: 30_000 });
		await expect(pane.getByTestId(/^data-table-row-variation-/)).toHaveCount(0);
		// A tile is "visible" to Playwright while it is still transparent under the parent:
		// wait for the deal to land before pressing it.
		await expect
			.poll(() => variation.evaluate((tile) => getComputedStyle(tile.parentElement!).opacity), {
				timeout: 15_000,
			})
			.toBe('1');
		await variation.click();
		await expect.poll(() => lines.count(), { timeout: 15_000 }).toBeGreaterThan(before);
		// The product's own tile, in the first slot, is the way back.
		await pane.getByTestId('variations-parent-tile').click();
		await expect(pane).toBeHidden();
		await expect(variable).toBeVisible();
	} finally {
		await setVariationsStyle(page, 'inline');
	}
});
