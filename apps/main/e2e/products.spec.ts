import { expect } from '@playwright/test';

import {
	addCheckoutProbeProduct,
	findVariableProduct,
	isolatedVariableProductTest as test,
} from './checkout-probe';

/**
 * Product browsing and search in the POS panel (both free and pro).
 *
 * The default view mode is "grid" (tile view). Tests cover both the grid
 * and table views, as well as toggling between them.
 */
test.describe('Products in POS', () => {
	test('should display product tiles in grid view by default', async ({ posPage: page }) => {
		const tiles = page.getByTestId('product-tile').or(page.getByTestId('variable-product-tile'));
		await expect(tiles.first()).toBeVisible({ timeout: 15_000 });

		const tileCount = await tiles.count();
		expect(tileCount).toBeGreaterThanOrEqual(1);
		await expect(page.getByTestId('data-table-count')).toBeVisible();
	});

	test('should display the view mode toggle button', async ({ posPage: page }) => {
		await expect(page.getByTestId('view-mode-toggle')).toBeVisible();
	});

	test('should switch from grid view to table view', async ({ posPage: page }) => {
		// Default is grid — verify tiles are showing
		const tiles = page.getByTestId('product-tile').or(page.getByTestId('variable-product-tile'));
		await expect(tiles.first()).toBeVisible({ timeout: 15_000 });

		// Click toggle to switch to table view
		await page.getByTestId('view-mode-toggle').click();

		// Table view should show column headers
		const columnheaders = page.getByRole('columnheader');
		await expect(columnheaders.first()).toBeVisible({ timeout: 15_000 });
		expect(await columnheaders.count()).toBeGreaterThanOrEqual(2);
	});

	test('should switch from table view back to grid view', async ({ posPage: page }) => {
		// Switch to table first
		await page.getByTestId('view-mode-toggle').click();
		await expect(page.getByRole('columnheader').first()).toBeVisible({ timeout: 15_000 });

		// Switch back to grid
		await page.getByTestId('view-mode-toggle').click();

		// Tiles should reappear
		const tiles = page.getByTestId('product-tile').or(page.getByTestId('variable-product-tile'));
		await expect(tiles.first()).toBeVisible({ timeout: 15_000 });
	});

	test('should search products by name', async ({ posPage: page }) => {
		await page.getByTestId('view-mode-toggle').click();
		const countEl = page.getByTestId('data-table-count');
		await expect(countEl).toBeVisible({ timeout: 15_000 });
		const initialCount = await countEl.textContent();
		const knownNonMatch = page.getByTestId('data-table-row-hoodie');
		await expect(knownNonMatch).toBeVisible({ timeout: 15_000 });

		const searchInput = page.getByTestId('search-products');
		await searchInput.fill('Belt');

		await expect(page.getByTestId('data-table-row-belt')).toBeVisible({ timeout: 15_000 });
		await expect(knownNonMatch).not.toBeVisible();
		await expect.poll(() => countEl.textContent(), { timeout: 15_000 }).not.toBe(initialCount);
	});

	test('should clear search and show all products', async ({ posPage: page }) => {
		const searchInput = page.getByTestId('search-products');

		await searchInput.fill('test');
		await page.waitForTimeout(1_000);

		await searchInput.clear();
		await page.waitForTimeout(1_000);

		await expect(page.getByTestId('data-table-count')).toContainText(/[1-9]/);
	});

	test('should show "No products found" for nonsense search', async ({ posPage: page }) => {
		const searchInput = page.getByTestId('search-products');
		await searchInput.fill('zzzznonexistentproductzzzz');
		await page.waitForTimeout(1_000);

		await expect(page.getByTestId('no-data-message')).toBeVisible({ timeout: 15_000 });
	});

	test('should update product count after search', async ({ posPage: page }) => {
		await page.getByTestId('view-mode-toggle').click();
		const countEl = page.getByTestId('data-table-count');
		await expect(countEl).toBeVisible({ timeout: 15_000 });
		const initialText = await countEl.textContent();
		await expect(page.getByTestId('data-table-row-hoodie')).toBeVisible({ timeout: 15_000 });

		const searchInput = page.getByTestId('search-products');
		await searchInput.fill('Belt');

		await expect(page.getByTestId('data-table-row-belt')).toBeVisible({ timeout: 15_000 });
		await expect(page.getByTestId('data-table-row-hoodie')).not.toBeVisible();
		await expect.poll(() => countEl.textContent(), { timeout: 15_000 }).not.toBe(initialText);
	});

	test('should add a simple product to cart by clicking tile', async ({ posPage: page }) => {
		await addCheckoutProbeProduct(page);
	});

	test('should show variable product tiles in grid view', async ({ posPage: page }) => {
		await findVariableProduct(page, page.getByTestId('screen-pos').getByTestId('search-products'));

		const variableTiles = page.getByTestId('variable-product-tile');
		await expect(variableTiles.first()).toBeVisible({ timeout: 10_000 });
	});

	test('should open variation popover when clicking variable product tile', async ({
		posPage: page,
	}) => {
		await findVariableProduct(page, page.getByTestId('screen-pos').getByTestId('search-products'));

		const variableTile = page.getByTestId('variable-product-tile');
		await expect(variableTile.first()).toBeVisible({ timeout: 10_000 });
		await variableTile.first().click();
		// The popover renders with role="dialog" from the Popover component
		await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });
	});

	test('should add product to cart in table view', async ({ posPage: page }) => {
		// Switch to table view
		await page.getByTestId('view-mode-toggle').click();
		await expect(page.getByRole('columnheader').first()).toBeVisible({ timeout: 15_000 });

		await addCheckoutProbeProduct(page);
	});
});
